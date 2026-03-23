import { Router } from 'express';
import fetch from 'node-fetch';
import { getLomoToken } from '../session';

// LOMO_URL is now per-session via auth.serverUrl

export const albumsRouter = Router();

// Cache for album list: key -> { data, timestamp }
let albumListCache: { data: any[]; timestamp: number } | null = null;
const ALBUM_LIST_CACHE_TTL = 30_000; // 30 seconds

export function clearAlbumListCache() {
  albumListCache = null;
}

interface LomoAlbum {
  ID: number;
  Title: string;
  Description: string;
  Author: string;
  CreateTime: string;
  LastModifiedTime: string;
}

interface LomoAlbumList {
  Albums: LomoAlbum[];
}

function isImageExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp', 'tiff', 'dng', 'raw'].includes(ext);
}

function buildOwner(userId: string, username: string) {
  return {
    id: userId,
    name: username,
    email: username,
    profileImagePath: '',
    avatarColor: 'primary',
  };
}

function toAlbumResponseDto(
  album: LomoAlbum,
  userId: string,
  username: string,
  assetCount: number,
  thumbnailAssetId: string | null,
  assets: any[] = [],
) {
  return {
    id: String(album.ID),
    albumName: album.Title,
    albumThumbnailAssetId: thumbnailAssetId,
    albumUsers: [],
    assetCount,
    assets,
    createdAt: album.CreateTime,
    description: album.Description || '',
    hasSharedLink: false,
    isActivityEnabled: false,
    order: 'desc',
    owner: buildOwner(userId, username),
    ownerId: userId,
    shared: false,
    startDate: undefined,
    endDate: undefined,
    updatedAt: album.LastModifiedTime,
  };
}

/**
 * GET /api/albums
 * List all albums
 */
albumsRouter.get('/', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  // Immich frontend requests shared=true separately — lomo has no sharing
  if (req.query.shared === 'true') {
    return res.json([]);
  }

  try {
    // Return cached list if fresh
    if (albumListCache && Date.now() - albumListCache.timestamp < ALBUM_LIST_CACHE_TTL) {
      return res.json(albumListCache.data);
    }

    const lomoRes = await fetch(`${auth.serverUrl}/album?token=${auth.token}`);
    if (!lomoRes.ok) {
      console.error(`[albums] list failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).json({ message: 'Failed to fetch albums' });
    }

    const data = await lomoRes.json() as LomoAlbumList;
    const albums = data.Albums || [];

    // Fetch asset count and first asset for each album in parallel
    const results = await Promise.all(
      albums.map(async (album) => {
        let assetCount = 0;
        let thumbnailAssetId: string | null = null;

        try {
          // Get asset count via HEAD
          const headRes = await fetch(`${auth.serverUrl}/album/${album.ID}/assets?token=${auth.token}`, {
            method: 'HEAD',
          });
          const countHeader = headRes.headers.get('x-total-count');
          if (countHeader) {
            assetCount = parseInt(countHeader, 10);
          }

          // Get first asset for thumbnail
          if (assetCount > 0) {
            const assetsRes = await fetch(
              `${auth.serverUrl}/album/${album.ID}/assets?token=${auth.token}&page=0&limit=1`,
            );
            if (assetsRes.ok) {
              const assetNames = await assetsRes.json() as string[];
              if (assetNames.length > 0) {
                thumbnailAssetId = assetNames[0];
              }
            }
          }
        } catch (e) {
          console.error(`[albums] error fetching details for album ${album.ID}:`, e);
        }

        return toAlbumResponseDto(album, auth.userId, auth.username, assetCount, thumbnailAssetId);
      }),
    );

    // Cache the result
    albumListCache = { data: results, timestamp: Date.now() };

    res.json(results);
  } catch (error) {
    console.error('[albums] list error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * GET /api/albums/:id
 * Album detail
 */
albumsRouter.get('/:id', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const albumId = req.params.id;
  console.log(`[albums] GET detail: albumId=${albumId}, withoutAssets=${req.query.withoutAssets}`);

  try {
    // Get album info
    const lomoRes = await fetch(`${auth.serverUrl}/album?token=${auth.token}`);
    if (!lomoRes.ok) {
      return res.status(lomoRes.status).json({ message: 'Failed to fetch albums' });
    }

    const data = await lomoRes.json() as LomoAlbumList;
    const album = (data.Albums || []).find((a) => String(a.ID) === albumId);
    if (!album) {
      return res.status(404).json({ message: 'Album not found' });
    }

    // Get asset count
    let assetCount = 0;
    const headRes = await fetch(`${auth.serverUrl}/album/${albumId}/assets?token=${auth.token}`, {
      method: 'HEAD',
    });
    const countHeader = headRes.headers.get('x-total-count');
    if (countHeader) {
      assetCount = parseInt(countHeader, 10);
    }

    // Get assets if not explicitly excluded
    let assets: any[] = [];
    let thumbnailAssetId: string | null = null;
    const withoutAssets = req.query.withoutAssets === 'true';

    if (!withoutAssets && assetCount > 0) {
      const assetsRes = await fetch(
        `${auth.serverUrl}/album/${albumId}/assets?token=${auth.token}&page=0&limit=10000`,
      );
      if (assetsRes.ok) {
        const assetNames = await assetsRes.json() as string[];
        thumbnailAssetId = assetNames[0] || null;
        assets = assetNames.map((name) => ({
          id: name,
          deviceAssetId: name,
          ownerId: auth.userId,
          deviceId: 'lomo',
          type: isImageExt(name) ? 'IMAGE' : 'VIDEO',
          originalPath: name,
          originalFileName: name,
          originalMimeType: isImageExt(name) ? 'image/jpeg' : 'video/mp4',
          thumbhash: null,
          fileCreatedAt: album.CreateTime,
          fileModifiedAt: album.LastModifiedTime,
          createdAt: album.CreateTime,
          updatedAt: album.LastModifiedTime,
          isFavorite: false,
          isArchived: false,
          duration: '0:00:00.000000',
          checksum: '',
          stackCount: null,
          exifInfo: {},
        }));
      }
    } else if (assetCount > 0) {
      // Just get the first asset for thumbnail
      const assetsRes = await fetch(
        `${auth.serverUrl}/album/${albumId}/assets?token=${auth.token}&page=0&limit=1`,
      );
      if (assetsRes.ok) {
        const assetNames = await assetsRes.json() as string[];
        thumbnailAssetId = assetNames[0] || null;
      }
    }

    const result = toAlbumResponseDto(album, auth.userId, auth.username, assetCount, thumbnailAssetId, assets);
    console.log(`[albums] detail response: id=${result.id}, assetCount=${result.assetCount}, albumName=${result.albumName}`);
    res.json(result);
  } catch (error) {
    console.error('[albums] detail error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * POST /api/albums
 * Create album
 */
albumsRouter.post('/', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { albumName, description } = req.body;
    const lomoRes = await fetch(`${auth.serverUrl}/album?token=${auth.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Title: albumName || 'Untitled',
        Description: description || '',
        Author: auth.username,
      }),
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[albums] create failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Failed to create album' });
    }

    const album = await lomoRes.json() as LomoAlbum;
    res.status(201).json(toAlbumResponseDto(album, auth.userId, auth.username, 0, null));
  } catch (error) {
    console.error('[albums] create error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * PATCH /api/albums/:id
 * Update album
 */
albumsRouter.patch('/:id', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const albumId = req.params.id;

  try {
    const { albumName, description } = req.body;
    const updateBody: any = { ID: parseInt(albumId, 10) };
    if (albumName !== undefined) updateBody.Title = albumName;
    if (description !== undefined) updateBody.Description = description;

    const lomoRes = await fetch(`${auth.serverUrl}/album?token=${auth.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[albums] update failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Failed to update album' });
    }

    // Fetch the updated album to return
    const listRes = await fetch(`${auth.serverUrl}/album?token=${auth.token}`);
    const data = await listRes.json() as LomoAlbumList;
    const album = (data.Albums || []).find((a) => String(a.ID) === albumId);

    if (album) {
      res.json(toAlbumResponseDto(album, auth.userId, auth.username, 0, null));
    } else {
      res.json({ id: albumId });
    }
  } catch (error) {
    console.error('[albums] update error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * DELETE /api/albums/:id
 * Delete album
 */
albumsRouter.delete('/:id', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const lomoRes = await fetch(`${auth.serverUrl}/album/${req.params.id}?token=${auth.token}`, {
      method: 'DELETE',
    });

    if (!lomoRes.ok) {
      console.error(`[albums] delete failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).json({ message: 'Failed to delete album' });
    }

    res.status(200).json({});
  } catch (error) {
    console.error('[albums] delete error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * PUT /api/albums/:id/assets
 * Add assets to album
 */
albumsRouter.put('/:id/assets', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    // Immich sends {ids: ["1.jpg", "2.jpg"]}
    const { ids } = req.body;
    // Lomo expects ["1", "2"] (just the numeric part, without extension)
    const assetIds = (ids || []).map((id: string) => {
      const dotIdx = id.lastIndexOf('.');
      return dotIdx > 0 ? id.substring(0, dotIdx) : id;
    });

    const lomoRes = await fetch(`${auth.serverUrl}/album/${req.params.id}/assets?token=${auth.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assetIds),
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[albums] add assets failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Failed to add assets' });
    }

    // Return success response matching Immich format
    const results = (ids || []).map((id: string) => ({
      id,
      success: true,
      error: undefined,
    }));
    res.json(results);
  } catch (error) {
    console.error('[albums] add assets error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * DELETE /api/albums/:id/assets
 * Remove assets from album
 */
albumsRouter.delete('/:id/assets', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const { ids } = req.body;
    const assetIds = (ids || []).map((id: string) => {
      const dotIdx = id.lastIndexOf('.');
      return dotIdx > 0 ? id.substring(0, dotIdx) : id;
    });

    const lomoRes = await fetch(`${auth.serverUrl}/album/${req.params.id}/assets?token=${auth.token}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assetIds),
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[albums] remove assets failed: ${lomoRes.status} ${errorText}`);
      return res.status(lomoRes.status).json({ message: 'Failed to remove assets' });
    }

    const results = (ids || []).map((id: string) => ({
      id,
      success: true,
      error: undefined,
    }));
    res.json(results);
  } catch (error) {
    console.error('[albums] remove assets error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});
