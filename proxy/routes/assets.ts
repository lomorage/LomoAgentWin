import { Router } from 'express';
import fetch from 'node-fetch';
import probe from 'probe-image-size';
import { cacheDimensions } from '../dimensions-cache';
import { getLomoToken } from '../session';
import { clearAlbumBucketCache } from './timeline';
import { clearAlbumListCache } from './albums';

// LOMO_URL is now per-session via auth.serverUrl

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

    if (!lomoRes.ok) {
      console.error(`[assets] thumbnail ${assetName} failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).end();
    }

    // Pipe the image response through
    const contentType = lomoRes.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const contentLength = lomoRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    // Cache for 1 day
    res.setHeader('Cache-Control', 'public, max-age=86400');

    lomoRes.body?.pipe(res);
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

    // Probe preview image to get actual dimensions
    let width: number | null = null;
    let height: number | null = null;
    try {
      const previewUrl = `${auth.serverUrl}/asset/preview/${encodeURIComponent(meta.Name)}?token=${auth.token}&width=1080&height=0`;
      const result = await probe(previewUrl);
      width = result.width;
      height = result.height;
      cacheDimensions(meta.Name, width, height);
    } catch (e) {
      console.error(`[assets] probe dimensions failed for ${meta.Name}:`, e);
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
      isFavorite: false,
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

// PUT /api/assets (bulk update) — stub
assetsRouter.put('/', (_req, res) => {
  res.json([]);
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
