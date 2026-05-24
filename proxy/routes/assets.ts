import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import probe from 'probe-image-size';
import heicConvert from 'heic-convert';
// sharp is loaded lazily from NODE_PATH to work with pkg (native modules can't be in snapshot)
let _sharp: any = null;
function getSharp(): any {
  if (!_sharp) {
    const nodePath = process.env.NODE_PATH || '';
    if (nodePath) {
      const sharpPath = require('path').join(nodePath, 'sharp');
      // Use createRequire to load from outside pkg snapshot
      const { createRequire } = require('module');
      const externalRequire = createRequire(sharpPath + '/');
      _sharp = externalRequire(sharpPath);
    } else {
      _sharp = require('sharp');
    }
    console.log('[assets] sharp loaded successfully');
  }
  return _sharp;
}
import { cacheDimensions } from '../dimensions-cache';
import { fetchAssetStatusMapForDates, isFavoriteStatus } from '../lomo-assets';
import { getLomoToken } from '../session';
import { clearAlbumBucketCache } from './timeline';
import { clearAlbumListCache } from './albums';

function isHeic(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext === 'heic' || ext === 'heif';
}

/**
 * Fetch original asset from lomo and convert to JPEG.
 * For HEIC/HEIF files, uses heic-convert (pure JS) since sharp's Windows build
 * lacks the HEVC decoder plugin. Then resizes with sharp.
 */
async function sharpFallbackThumbnail(
  serverUrl: string, token: string, assetName: string, width: number, height: number
): Promise<Buffer> {
  const origRes = await fetch(`${serverUrl}/asset/${encodeURIComponent(assetName)}?token=${token}`);
  if (!origRes.ok) {
    throw new Error(`Failed to fetch original: ${origRes.status}`);
  }
  const buf = Buffer.from(await origRes.arrayBuffer());

  let jpegBuf: Buffer;
  if (isHeic(assetName)) {
    // Convert HEIC to JPEG first using pure-JS decoder
    console.log(`[assets] heic-convert for ${assetName}`);
    const converted = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.8 } as any);
    jpegBuf = Buffer.from(converted);
  } else {
    jpegBuf = buf;
  }

  // Resize with sharp
  const s = getSharp();
  const resizeWidth = width > 0 ? width : undefined;
  const resizeHeight = height > 0 ? height : undefined;
  return s(jpegBuf)
    .resize(resizeWidth, resizeHeight, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// LOMO_URL is now per-session via auth.serverUrl

const upload = multer({ storage: multer.memoryStorage() });

export const assetsRouter = Router();

type ThumbnailResult = {
  buffer: Buffer;
  contentType: string;
};

type ThumbnailCacheMeta = {
  contentType: string;
  createdAt: string;
};

const THUMBNAIL_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const THUMBNAIL_FETCH_CONCURRENCY = Number(process.env.THUMBNAIL_FETCH_CONCURRENCY || 6);
const thumbnailInflight = new Map<string, Promise<ThumbnailResult>>();

class AsyncLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

const thumbnailFetchLimiter = new AsyncLimiter(Math.max(1, THUMBNAIL_FETCH_CONCURRENCY));

function getThumbnailCacheDir(): string {
  const configDir = process.env.CONFIG_PATH ? path.dirname(process.env.CONFIG_PATH) : process.cwd();
  return path.join(configDir, 'thumbnail-cache');
}

function thumbnailCacheKey(serverUrl: string, assetName: string, width: number, height: number, size: string): string {
  return createHash('sha1').update(`${serverUrl}\0${assetName}\0${width}\0${height}\0${size}`).digest('hex');
}

function thumbnailCachePaths(cacheKey: string): { dataPath: string; metaPath: string } {
  const cacheDir = getThumbnailCacheDir();
  return {
    dataPath: path.join(cacheDir, `${cacheKey}.bin`),
    metaPath: path.join(cacheDir, `${cacheKey}.json`),
  };
}

async function readThumbnailCache(cacheKey: string): Promise<ThumbnailResult | null> {
  const { dataPath, metaPath } = thumbnailCachePaths(cacheKey);
  try {
    const [data, metaRaw] = await Promise.all([
      fs.promises.readFile(dataPath),
      fs.promises.readFile(metaPath, 'utf-8'),
    ]);
    const meta = JSON.parse(metaRaw) as ThumbnailCacheMeta;
    const createdAt = Date.parse(meta.createdAt);
    if (!meta.contentType || !Number.isFinite(createdAt)) {
      return null;
    }

    if (Date.now() - createdAt > THUMBNAIL_CACHE_MAX_AGE_SECONDS * 1000) {
      await Promise.all([
        fs.promises.rm(dataPath, { force: true }),
        fs.promises.rm(metaPath, { force: true }),
      ]);
      return null;
    }

    return { buffer: data, contentType: meta.contentType };
  } catch {
    return null;
  }
}

async function writeThumbnailCache(cacheKey: string, result: ThumbnailResult): Promise<void> {
  const cacheDir = getThumbnailCacheDir();
  const { dataPath, metaPath } = thumbnailCachePaths(cacheKey);
  const tmpDataPath = `${dataPath}.${process.pid}.${Date.now()}.tmp`;
  const tmpMetaPath = `${metaPath}.${process.pid}.${Date.now()}.tmp`;

  await fs.promises.mkdir(cacheDir, { recursive: true });
  await fs.promises.writeFile(tmpDataPath, result.buffer);
  await fs.promises.writeFile(
    tmpMetaPath,
    JSON.stringify({ contentType: result.contentType, createdAt: new Date().toISOString() } satisfies ThumbnailCacheMeta),
  );
  await fs.promises.rm(dataPath, { force: true });
  await fs.promises.rm(metaPath, { force: true });
  await fs.promises.rename(tmpDataPath, dataPath);
  await fs.promises.rename(tmpMetaPath, metaPath);
}

async function fetchThumbnailFromLomo(
  serverUrl: string,
  token: string,
  assetName: string,
  width: number,
  height: number,
): Promise<ThumbnailResult> {
  const lomoRes = await fetch(
    `${serverUrl}/asset/preview/${encodeURIComponent(assetName)}?token=${token}&width=${width}&height=${height}`,
  );

  if (lomoRes.ok) {
    const contentType = lomoRes.headers.get('content-type') || 'image/jpeg';
    return {
      buffer: Buffer.from(await lomoRes.arrayBuffer()),
      contentType,
    };
  }

  // Fallback: convert original with sharp (handles HEIC, etc.)
  console.log(`[assets] sharp fallback for thumbnail ${assetName}`);
  const buffer = await sharpFallbackThumbnail(serverUrl, token, assetName, width, height);
  return { buffer, contentType: 'image/jpeg' };
}

async function getCachedThumbnail(
  serverUrl: string,
  token: string,
  assetName: string,
  width: number,
  height: number,
  size: string,
): Promise<ThumbnailResult> {
  const cacheKey = thumbnailCacheKey(serverUrl, assetName, width, height, size);
  const cached = await readThumbnailCache(cacheKey);
  if (cached) {
    return cached;
  }

  const existing = thumbnailInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = thumbnailFetchLimiter
    .run(async () => {
      const cachedAfterQueue = await readThumbnailCache(cacheKey);
      if (cachedAfterQueue) {
        return cachedAfterQueue;
      }

      const result = await fetchThumbnailFromLomo(serverUrl, token, assetName, width, height);
      await writeThumbnailCache(cacheKey, result).catch((error) => {
        console.warn(`[assets] thumbnail cache write failed for ${assetName}:`, error);
      });
      return result;
    })
    .finally(() => {
      thumbnailInflight.delete(cacheKey);
    });

  thumbnailInflight.set(cacheKey, pending);
  return pending;
}

function getMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function isImage(name: string): boolean {
  return getMimeType(name).startsWith('image/');
}

/**
 * GET /api/assets/:id/thumbnail
 * Proxies to lomo /asset/preview/{name}?token=X
 */
assetsRouter.get('/:id/thumbnail', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const assetName = req.params.id;
  const size = req.query.size as string;

  // Map Immich sizes to lomo preview dimensions
  let width = 250;
  let height = 0;
  if (size === 'preview') {
    width = 1080;
    height = 0;
  }

  try {
    const thumbnail = await getCachedThumbnail(auth.serverUrl, auth.token, assetName, width, height, size || 'thumbnail');
    res.setHeader('Content-Type', thumbnail.contentType);
    res.setHeader('Content-Length', thumbnail.buffer.length);
    res.setHeader('Cache-Control', `public, max-age=${THUMBNAIL_CACHE_MAX_AGE_SECONDS}, immutable`);
    res.end(thumbnail.buffer);
  } catch (error) {
    console.error(`[assets] thumbnail error for ${assetName}:`, error);
    res.status(500).end();
  }
});

/**
 * GET /api/assets/:id/original
 * Proxies to lomo /asset/{name}?token=X
 */
assetsRouter.get('/:id/original', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const assetName = req.params.id;

  try {
    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/${encodeURIComponent(assetName)}?token=${auth.token}`
    );

    if (!lomoRes.ok) {
      console.error(`[assets] original ${assetName} failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).end();
    }

    const contentType = lomoRes.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const contentLength = lomoRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `inline; filename="${assetName}"`);

    lomoRes.body?.pipe(res);
  } catch (error) {
    console.error(`[assets] original error for ${assetName}:`, error);
    res.status(500).end();
  }
});

/**
 * GET /api/assets/:id/video/playback
 * Proxies to lomo /asset/{name}?token=X (same as original for video)
 */
assetsRouter.get('/:id/video/playback', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const assetName = req.params.id;

  try {
    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/${encodeURIComponent(assetName)}?token=${auth.token}`
    );

    if (!lomoRes.ok) {
      return res.status(lomoRes.status).end();
    }

    const contentType = lomoRes.headers.get('content-type') || getMimeType(assetName);
    res.setHeader('Content-Type', contentType);
    const contentLength = lomoRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    lomoRes.body?.pipe(res);
  } catch (error) {
    console.error(`[assets] playback error for ${assetName}:`, error);
    res.status(500).end();
  }
});

/**
 * GET /api/assets/:id
 * Fetches lomo asset metadata and converts to AssetResponseDto
 */
assetsRouter.get('/:id', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const assetName = req.params.id;

  try {
    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/metadata/${encodeURIComponent(assetName)}?token=${auth.token}`
    );

    if (!lomoRes.ok) {
      console.error(`[assets] metadata ${assetName} failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).json({ message: 'Asset not found' });
    }

    const meta = await lomoRes.json() as {
      Date: string;
      Device: string;
      Hash: string;
      Name: string;
      Latitude?: string;
      Longtitude?: string; // Note: lomo API has typo "Longtitude"
    };

    const lat = meta.Latitude && meta.Latitude !== '888' ? parseFloat(meta.Latitude) : null;
    const lng = meta.Longtitude && meta.Longtitude !== '888' ? parseFloat(meta.Longtitude) : null;

    // Fetch favorite state from the backend day tree so the UI matches lomo-backend.
    const statusMap = await fetchAssetStatusMapForDates(auth.serverUrl, auth.token, [{ name: meta.Name, date: meta.Date }]);
    const isFavorite = isFavoriteStatus(statusMap.get(meta.Name) ?? 0);

    // Probe preview image to get actual dimensions
    let width: number | null = null;
    let height: number | null = null;
    try {
      const previewUrl = `${auth.serverUrl}/asset/preview/${encodeURIComponent(meta.Name)}?token=${auth.token}&width=1080&height=0`;
      const result = await probe(previewUrl);
      width = result.width;
      height = result.height;
      cacheDimensions(meta.Name, width, height, auth.token, auth.serverUrl);
    } catch {
      // Fallback: fetch original and use sharp for dimensions (handles HEIC, etc.)
      try {
        const origRes = await fetch(`${auth.serverUrl}/asset/${encodeURIComponent(meta.Name)}?token=${auth.token}`);
        if (origRes.ok) {
          const buf = Buffer.from(await origRes.arrayBuffer());
          const s = getSharp();
        const metadata = await s(buf).metadata();
          width = metadata.width || null;
          height = metadata.height || null;
          if (width && height) cacheDimensions(meta.Name, width, height, auth.token, auth.serverUrl);
          console.log(`[assets] sharp metadata fallback for ${meta.Name}: ${width}x${height}`);
        }
      } catch (e2) {
        console.error(`[assets] sharp metadata fallback failed for ${meta.Name}:`, e2);
      }
    }

    // Build AssetResponseDto
    res.json({
      id: meta.Name,
      checksum: meta.Hash,
      createdAt: meta.Date,
      deviceAssetId: meta.Name,
      deviceId: meta.Device,
      duplicateId: null,
      duration: isImage(meta.Name) ? '0:00:00.000000' : '',
      exifInfo: {
        latitude: lat,
        longitude: lng,
        dateTimeOriginal: meta.Date,
        make: null,
        model: null,
        city: null,
        state: null,
        country: null,
        description: null,
        fileSizeInByte: null,
        exifImageWidth: width,
        exifImageHeight: height,
      },
      fileCreatedAt: meta.Date,
      fileModifiedAt: meta.Date,
      hasMetadata: true,
      height,
      isArchived: false,
      isEdited: false,
      isFavorite,
      isOffline: false,
      isTrashed: false,
      libraryId: null,
      livePhotoVideoId: null,
      localDateTime: meta.Date,
      originalFileName: meta.Name,
      originalMimeType: getMimeType(meta.Name),
      originalPath: meta.Name,
      ownerId: auth.userId,
      resized: true,
      stack: null,
      tags: [],
      thumbhash: null,
      type: isImage(meta.Name) ? 'IMAGE' : 'VIDEO',
      updatedAt: meta.Date,
      visibility: 'timeline',
      width,
    });
  } catch (error) {
    console.error(`[assets] metadata error for ${assetName}:`, error);
    res.status(500).json({ message: 'Internal error' });
  }
});

// POST /api/assets/bulk-upload-check
assetsRouter.post('/bulk-upload-check', async (req, res) => {
  // Always allow upload (no duplicate detection)
  const { assets } = req.body as { assets: Array<{ id: string; checksum: string }> };
  res.json({
    results: (assets || []).map((a) => ({
      id: a.id,
      action: 'accept',
      assetId: null,
      isTrashed: false,
    })),
  });
});

// POST /api/assets (upload)
assetsRouter.post('/', upload.single('assetData'), async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    // Compute SHA-1 of the file
    const sha1 = createHash('sha1').update(file.buffer).digest('hex');
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const modifiedTime = (req.body.fileCreatedAt || req.body.fileModifiedAt || new Date().toISOString());

    console.log(`[assets] upload: ${file.originalname} (${file.size} bytes), sha1=${sha1}, ext=${ext}`);

    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/${sha1}?token=${auth.token}&ext=${ext}&modifiedtime=${encodeURIComponent(modifiedTime)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file.buffer,
      },
    );

    if (lomoRes.status === 409) {
      // Duplicate — return success with duplicate status
      const data = await lomoRes.json() as { Name: string };
      console.log(`[assets] upload duplicate: ${data.Name}`);
      return res.status(200).json({ id: data.Name, status: 'duplicate' });
    }

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[assets] upload failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Upload failed' });
    }

    const data = await lomoRes.json() as { Name: string; Hash: string; Date: string };
    console.log(`[assets] upload success: ${data.Name}`);

    // Invalidate caches
    clearAlbumBucketCache();
    clearAlbumListCache();

    res.status(201).json({ id: data.Name, status: 'created' });
  } catch (error) {
    console.error('[assets] upload error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

// Helper: set or remove favorite on lomo backend
async function setFavorite(serverUrl: string, token: string, ids: string[], isFavorite: boolean): Promise<boolean> {
  const method = isFavorite ? 'POST' : 'DELETE';
  console.log(`[assets] ${isFavorite ? 'favorite' : 'unfavorite'}: ${ids.length} assets`);
  const lomoRes = await fetch(`${serverUrl}/assets/favorite?token=${token}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids),
  });
  if (!lomoRes.ok) {
    const errorText = await lomoRes.text();
    console.error(`[assets] favorite ${method} failed: ${lomoRes.status} ${errorText}`);
    return false;
  }
  return true;
}

// PUT /api/assets (bulk update — handles isFavorite)
assetsRouter.put('/', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { ids, isFavorite } = req.body as { ids: string[]; isFavorite?: boolean };
    if (!ids || ids.length === 0) {
      return res.json([]);
    }

    if (isFavorite !== undefined) {
      const ok = await setFavorite(auth.serverUrl, auth.token, ids, isFavorite);
      if (!ok) {
        return res.status(500).json({ message: 'Failed to update favorites' });
      }
      clearAlbumBucketCache();
    }

    res.json([]);
  } catch (error) {
    console.error('[assets] bulk update error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

// PUT /api/assets/:id (single asset update — handles isFavorite)
assetsRouter.put('/:id', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const assetName = req.params.id;

  try {
    const { isFavorite } = req.body as { isFavorite?: boolean };

    if (isFavorite !== undefined) {
      const ok = await setFavorite(auth.serverUrl, auth.token, [assetName], isFavorite);
      if (!ok) {
        return res.status(500).json({ message: 'Failed to update favorite' });
      }
      clearAlbumBucketCache();
    }

    // Return updated asset — re-fetch metadata
    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/metadata/${encodeURIComponent(assetName)}?token=${auth.token}`
    );
    if (!lomoRes.ok) {
      return res.status(lomoRes.status).json({ message: 'Asset not found' });
    }
    const meta = await lomoRes.json() as {
      Date: string; Device: string; Hash: string; Name: string;
      Latitude?: string; Longtitude?: string;
    };
    const statusMap = await fetchAssetStatusMapForDates(auth.serverUrl, auth.token, [{ name: meta.Name, date: meta.Date }]);
    const favoriteStatus = isFavoriteStatus(statusMap.get(meta.Name) ?? 0);

    res.json({
      id: meta.Name,
      checksum: meta.Hash,
      createdAt: meta.Date,
      deviceAssetId: meta.Name,
      deviceId: meta.Device,
      duplicateId: null,
      duration: isImage(meta.Name) ? '0:00:00.000000' : '',
      exifInfo: { dateTimeOriginal: meta.Date },
      fileCreatedAt: meta.Date,
      fileModifiedAt: meta.Date,
      hasMetadata: true,
      isArchived: false,
      isEdited: false,
      isFavorite: favoriteStatus,
      isOffline: false,
      isTrashed: false,
      libraryId: null,
      livePhotoVideoId: null,
      localDateTime: meta.Date,
      originalFileName: meta.Name,
      originalMimeType: getMimeType(meta.Name),
      originalPath: meta.Name,
      ownerId: auth.userId,
      resized: true,
      stack: null,
      tags: [],
      thumbhash: null,
      type: isImage(meta.Name) ? 'IMAGE' : 'VIDEO',
      updatedAt: meta.Date,
      visibility: 'timeline',
    });
  } catch (error) {
    console.error(`[assets] update error for ${assetName}:`, error);
    res.status(500).json({ message: 'Internal error' });
  }
});

// DELETE /api/assets (bulk delete)
assetsRouter.delete('/', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { ids, force } = req.body as { ids: string[]; force?: boolean };
    if (!ids || ids.length === 0) {
      return res.json([]);
    }

    const deleteList = ids.map((id: string) => ({
      ID: id,
      Type: 0,
      ...(force ? { Force: true } : {}),
    }));

    console.log(`[assets] bulk delete: ${ids.length} assets, force=${!!force}`);

    const lomoRes = await fetch(`${auth.serverUrl}/asset?token=${auth.token}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ List: deleteList }),
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[assets] bulk delete failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Failed to delete assets' });
    }

    // Invalidate caches so timeline/albums reflect the deletion
    clearAlbumBucketCache();
    clearAlbumListCache();

    console.log(`[assets] bulk delete success: ${ids.length} assets`);
    res.json([]);
  } catch (error) {
    console.error('[assets] bulk delete error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

// POST /api/assets/jobs — stub
assetsRouter.post('/jobs', (_req, res) => {
  res.status(204).end();
});
