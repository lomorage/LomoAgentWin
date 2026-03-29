import { createHash } from 'crypto';
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
  return s(jpegBuf)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// LOMO_URL is now per-session via auth.serverUrl

const upload = multer({ storage: multer.memoryStorage() });

export const assetsRouter = Router();

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
  let height = 250;
  if (size === 'preview') {
    width = 1080;
    height = 1080;
  }

  try {
    const lomoRes = await fetch(
      `${auth.serverUrl}/asset/preview/${encodeURIComponent(assetName)}?token=${auth.token}&width=${width}&height=${height}`
    );

    if (lomoRes.ok) {
      const contentType = lomoRes.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentLength = lomoRes.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      lomoRes.body?.pipe(res);
      return;
    }

    // Fallback: convert original with sharp (handles HEIC, etc.)
    console.log(`[assets] sharp fallback for thumbnail ${assetName}`);
    const jpegBuf = await sharpFallbackThumbnail(auth.serverUrl, auth.token, assetName, width, height);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', jpegBuf.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(jpegBuf);
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

    // Fetch favorite status from merkletree
    const isFavorite = await fetchIsFavorite(auth.serverUrl, auth.token, meta.Name, meta.Date);

    // Probe preview image to get actual dimensions
    let width: number | null = null;
    let height: number | null = null;
    try {
      const previewUrl = `${auth.serverUrl}/asset/preview/${encodeURIComponent(meta.Name)}?token=${auth.token}&width=1080&height=0`;
      const result = await probe(previewUrl);
      width = result.width;
      height = result.height;
      cacheDimensions(meta.Name, width, height);
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
          if (width && height) cacheDimensions(meta.Name, width, height);
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

// Helper: fetch isFavorite status for an asset from merkletree
async function fetchIsFavorite(serverUrl: string, token: string, assetName: string, dateStr: string): Promise<boolean> {
  try {
    const d = new Date(dateStr);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const res = await fetch(`${serverUrl}/assets/merkletree/${year}/${month}/${day}?token=${token}`);
    if (!res.ok) return false;
    const dayData = await res.json() as { Assets: Array<{ Name: string; Status: number }> };
    const asset = dayData.Assets?.find(a => a.Name === assetName);
    return asset ? (asset.Status & 8) !== 0 : false;
  } catch {
    return false;
  }
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
      isFavorite: isFavorite ?? false,
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
