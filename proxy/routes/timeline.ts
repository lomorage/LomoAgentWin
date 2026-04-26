import { Router } from 'express';
import fetch from 'node-fetch';
import { getAssetRatios } from '../dimensions-cache';
import {
  fetchAssetDateInfos,
  fetchAssetStatusMapForDates,
  isFavoriteStatus,
  type LomoAssetDateInfo,
  parseBooleanQueryValue,
} from '../lomo-assets';
import { getLomoToken } from '../session';

export const timelineRouter = Router();

// Lomo merkletree types
interface LomoAsset {
  Date: string;
  Device: string;
  Status: number;
  Hash: string;
  Name: string;
}

interface LomoDay {
  Assets: LomoAsset[];
  Day: number;
  Hash: string;
}

interface LomoMonth {
  Days: LomoDay[];
  Hash: string;
  Month: number;
}

interface LomoYear {
  Hash: string;
  Months: LomoMonth[];
  Year: number;
}

interface LomoYearList {
  Hash: string;
  Years: LomoYear[];
}

interface LomoMonthDetail {
  Days: LomoDay[];
  Hash: string;
  Month: number;
}

function isImageExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp', 'tiff', 'dng', 'raw'].includes(ext);
}

function isVideoExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'wmv', 'flv'].includes(ext);
}

// Cache for album assets grouped by month: albumId -> { data, timestamp }
const albumBucketCache = new Map<string, {
  data: Map<string, LomoAssetDateInfo[]>;
  timestamp: number;
}>();
const ALBUM_CACHE_TTL = 60_000; // 60 seconds

export function clearAlbumBucketCache() {
  albumBucketCache.clear();
}

/**
 * Fetch all asset names in an album, then fetch metadata to get dates.
 * Returns assets grouped by YYYY-MM bucket. Results are cached per album.
 */
async function fetchAlbumAssetsByMonth(
  albumId: string,
  token: string,
  serverUrl: string,
): Promise<Map<string, LomoAssetDateInfo[]>> {
  // Check cache
  const cached = albumBucketCache.get(albumId);
  if (cached && Date.now() - cached.timestamp < ALBUM_CACHE_TTL) {
    return cached.data;
  }

  // Get all asset names in the album
  const assetsRes = await fetch(
    `${serverUrl}/album/${albumId}/assets?token=${token}&page=0&limit=10000`,
  );
  if (!assetsRes.ok) {
    throw new Error(`Failed to fetch album assets: ${assetsRes.status}`);
  }

  const assetNames = await assetsRes.json() as string[];
  const byMonth = new Map<string, LomoAssetDateInfo[]>();
  const assets = await fetchAssetDateInfos(serverUrl, token, assetNames);

  for (const asset of assets) {
    const d = new Date(asset.date);
    const year = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const bucket = `${year}-${mm}-01T00:00:00.000Z`;
    if (!byMonth.has(bucket)) {
      byMonth.set(bucket, []);
    }
    byMonth.get(bucket)!.push(asset);
  }

  // Store in cache
  albumBucketCache.set(albumId, { data: byMonth, timestamp: Date.now() });

  return byMonth;
}

/**
 * GET /api/timeline/buckets
 * Fetches full merkletree from lomo and converts to TimeBucketsResponseDto[]
 * Supports albumId query param for album-specific buckets.
 */
timelineRouter.get('/buckets', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const albumId = req.query.albumId as string | undefined;
  const favoriteFilter = parseBooleanQueryValue(req.query.isFavorite);

  try {
    if (albumId) {
      // Album-specific buckets
      const byMonth = await fetchAlbumAssetsByMonth(albumId, auth.token, auth.serverUrl);
      const bucketResults = await Promise.all(
        Array.from(byMonth.entries()).map(async ([bucket, assets]) => {
          if (favoriteFilter === undefined) {
            return { timeBucket: bucket, count: assets.length };
          }

          const statusMap = await fetchAssetStatusMapForDates(auth.serverUrl, auth.token, assets);
          const count = assets.filter((asset) => isFavoriteStatus(statusMap.get(asset.name) ?? 0) === favoriteFilter).length;
          return { timeBucket: bucket, count };
        }),
      );

      const buckets = bucketResults.filter((bucket) => bucket.count > 0);
      buckets.sort((a, b) => b.timeBucket.localeCompare(a.timeBucket));
      return res.json(buckets);
    }

    // Default: full merkletree
    const lomoRes = await fetch(`${auth.serverUrl}/assets/merkletree?token=${auth.token}`);
    if (!lomoRes.ok) {
      console.error(`[timeline] merkletree failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).json({ message: 'Failed to fetch assets' });
    }

    const data = await lomoRes.json() as LomoYearList;
    const years = data.Years || [];
    console.log(`[timeline] merkletree from ${auth.serverUrl}: years=${years.length}`);

    // Collect all year/month pairs from the root tree
    const monthEntries: Array<{ year: number; month: number; days: LomoDay[] }> = [];
    for (const year of years) {
      for (const month of year.Months || []) {
        monthEntries.push({ year: year.Year, month: month.Month, days: month.Days || [] });
      }
    }

    // If the root tree doesn't include day/asset data (Days empty), fetch each month detail
    const rootHasAssets = monthEntries.some((m) => m.days.length > 0);
    if (!rootHasAssets && monthEntries.length > 0) {
      console.log(`[timeline] root tree has no day detail, fetching ${monthEntries.length} month(s) individually`);
      await Promise.all(
        monthEntries.map(async (entry) => {
          try {
            const res = await fetch(
              `${auth.serverUrl}/assets/merkletree/${entry.year}/${entry.month}?token=${auth.token}`,
            );
            if (res.ok) {
              const monthData = await res.json() as LomoMonthDetail;
              entry.days = monthData.Days || [];
            }
          } catch {
            // leave days empty for this month
          }
        }),
      );
    }

    const buckets: Array<{ timeBucket: string; count: number }> = [];
    for (const entry of monthEntries) {
      let count = 0;
      for (const day of entry.days) {
        for (const asset of day.Assets || []) {
          if (favoriteFilter === undefined || isFavoriteStatus(asset.Status) === favoriteFilter) {
            count += 1;
          }
        }
      }
      if (count > 0) {
        const mm = String(entry.month).padStart(2, '0');
        buckets.push({ timeBucket: `${entry.year}-${mm}-01T00:00:00.000Z`, count });
      }
    }

    // Sort descending (newest first) — Immich default
    buckets.sort((a, b) => b.timeBucket.localeCompare(a.timeBucket));
    console.log(`[timeline] returning ${buckets.length} buckets`);

    res.json(buckets);
  } catch (error) {
    console.error('[timeline] buckets error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});

/**
 * GET /api/timeline/bucket?timeBucket=YYYY-MM-DDT00:00:00.000Z
 * Fetches a specific month from lomo merkletree and converts to TimeBucketAssetResponseDto
 */
timelineRouter.get('/bucket', async (req, res) => {
  const auth = getLomoToken(req);
  if (!auth) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const timeBucket = req.query.timeBucket as string;
  if (!timeBucket) {
    return res.status(400).json({ message: 'timeBucket parameter required' });
  }

  const albumId = req.query.albumId as string | undefined;
  const favoriteFilter = parseBooleanQueryValue(req.query.isFavorite);

  // Parse year and month from timeBucket (e.g., "2024-03-01T00:00:00.000Z")
  const date = new Date(timeBucket);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-indexed

  try {
    if (albumId) {
      // Album-specific bucket: fetch album assets and filter by month
      const byMonth = await fetchAlbumAssetsByMonth(albumId, auth.token, auth.serverUrl);
      const bucketKey = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
      const assets = byMonth.get(bucketKey) || [];
      const statusMap = await fetchAssetStatusMapForDates(auth.serverUrl, auth.token, assets);
      const filteredAssets =
        favoriteFilter === undefined
          ? assets
          : assets.filter((asset) => isFavoriteStatus(statusMap.get(asset.name) ?? 0) === favoriteFilter);

      // Probe actual dimensions for album assets
      const albumAssetNames = filteredAssets.map(a => a.name);
      const albumRatioMap = await getAssetRatios(albumAssetNames, auth.token, auth.serverUrl);

      const result = {
        id: filteredAssets.map(a => a.name),
        city: filteredAssets.map(() => null),
        country: filteredAssets.map(() => null),
        duration: filteredAssets.map(a => isVideoExt(a.name) ? '0:00:00.000000' : null),
        fileCreatedAt: filteredAssets.map(a => a.date),
        isFavorite: filteredAssets.map(a => isFavoriteStatus(statusMap.get(a.name) ?? 0)),
        isImage: filteredAssets.map(a => isImageExt(a.name)),
        isTrashed: filteredAssets.map(() => false),
        livePhotoVideoId: filteredAssets.map(() => null),
        localOffsetHours: filteredAssets.map(() => 0),
        ownerId: filteredAssets.map(() => auth.userId),
        projectionType: filteredAssets.map(() => null),
        ratio: filteredAssets.map(a => albumRatioMap.get(a.name) ?? (isVideoExt(a.name) ? 1.78 : 1.5)),
        thumbhash: filteredAssets.map(() => null),
        visibility: filteredAssets.map(() => 'timeline'),
      };

      return res.json(result);
    }

    const lomoRes = await fetch(`${auth.serverUrl}/assets/merkletree/${year}/${month}?token=${auth.token}`);
    if (!lomoRes.ok) {
      console.error(`[timeline] bucket ${year}/${month} failed: ${lomoRes.status}`);
      return res.status(lomoRes.status).json({ message: 'Failed to fetch bucket' });
    }

    const data = await lomoRes.json() as LomoMonthDetail;

    // Flatten all assets from all days
    const allAssets: Array<{ asset: LomoAsset; day: number }> = [];
    for (const day of data.Days || []) {
      for (const asset of day.Assets || []) {
        allAssets.push({ asset, day: day.Day });
      }
    }
    const filteredAssets =
      favoriteFilter === undefined
        ? allAssets
        : allAssets.filter((entry) => isFavoriteStatus(entry.asset.Status) === favoriteFilter);

    // Probe actual dimensions for all assets in parallel
    const assetNames = filteredAssets.map(a => a.asset.Name);
    const ratioMap = await getAssetRatios(assetNames, auth.token, auth.serverUrl);

    // Build column-oriented response (TimeBucketAssetResponseDto)
    const result = {
      id: filteredAssets.map(a => a.asset.Name),
      city: filteredAssets.map(() => null),
      country: filteredAssets.map(() => null),
      duration: filteredAssets.map(a => isVideoExt(a.asset.Name) ? '0:00:00.000000' : null),
      fileCreatedAt: filteredAssets.map(a => a.asset.Date),
      isFavorite: filteredAssets.map(a => isFavoriteStatus(a.asset.Status)),
      isImage: filteredAssets.map(a => isImageExt(a.asset.Name)),
      isTrashed: filteredAssets.map(() => false),
      livePhotoVideoId: filteredAssets.map(() => null),
      localOffsetHours: filteredAssets.map(() => 0),
      ownerId: filteredAssets.map(() => auth.userId),
      projectionType: filteredAssets.map(() => null),
      ratio: filteredAssets.map(a => ratioMap.get(a.asset.Name) ?? (isVideoExt(a.asset.Name) ? 1.78 : 1.5)),
      thumbhash: filteredAssets.map(() => null),
      visibility: filteredAssets.map(a => (a.asset.Status & 2) !== 0 ? 'hidden' : 'timeline'),
    };

    res.json(result);
  } catch (error) {
    console.error('[timeline] bucket error:', error);
    res.status(500).json({ message: 'Internal error' });
  }
});
