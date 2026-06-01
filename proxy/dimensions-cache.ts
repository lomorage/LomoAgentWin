import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { lomoFetch } from './http-agent';
import probe from 'probe-image-size';
import { rgbaToThumbHash } from 'thumbhash';

export type AssetDimensionDescriptor = {
  name: string;
  hash?: string | null;
};

type Dimensions = {
  width: number;
  height: number;
};

type DimensionsCacheRecord = Dimensions & {
  thumbhash?: string | null;
  updatedAt: string;
};

type PersistedDimensionsCache = {
  version: 1;
  entries: Record<string, DimensionsCacheRecord>;
};

export type AssetCacheEntry = {
  ratio: number;
  thumbhash: string | null;
};

// sharp is loaded lazily from NODE_PATH (native module, excluded from pkg snapshot)
let _sharp: any = null;
function getSharp(): any {
  if (!_sharp) {
    const nodePath = process.env.NODE_PATH || '';
    if (nodePath) {
      const sharpPath = require('path').join(nodePath, 'sharp');
      const { createRequire } = require('module');
      const externalRequire = createRequire(sharpPath + '/');
      _sharp = externalRequire(sharpPath);
    } else {
      _sharp = require('sharp');
    }
  }
  return _sharp;
}

const cache = new Map<string, DimensionsCacheRecord>();
const inflight = new Map<string, Promise<Dimensions | null>>();
const prefetchQueue = new Map<
  string,
  {
    asset: AssetDimensionDescriptor;
    token: string;
    serverUrl: string;
  }
>();
let loaded = false;
let dirty = false;
let saveTimer: NodeJS.Timeout | undefined;
let prefetchTimer: NodeJS.Timeout | undefined;
let prefetchRunning = false;

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

function normalizeAsset(asset: string | AssetDimensionDescriptor): AssetDimensionDescriptor {
  return typeof asset === 'string' ? { name: asset } : asset;
}

function dimensionsCachePath(): string {
  const configDir = process.env.CONFIG_PATH ? path.dirname(process.env.CONFIG_PATH) : process.cwd();
  return path.join(configDir, 'ratio-cache.json');
}

function cacheKey(serverUrl: string, asset: AssetDimensionDescriptor): string {
  const identity = JSON.stringify({
    serverUrl: normalizeServerUrl(serverUrl),
    name: asset.name,
    hash: asset.hash || '',
  });
  return createHash('sha1').update(identity).digest('hex');
}

async function ensureCacheLoaded(): Promise<void> {
  if (loaded) {
    return;
  }

  loaded = true;
  try {
    const raw = await fs.promises.readFile(dimensionsCachePath(), 'utf-8');
    const parsed = JSON.parse(raw) as PersistedDimensionsCache;
    for (const [key, value] of Object.entries(parsed.entries || {})) {
      if (Number.isFinite(value.width) && Number.isFinite(value.height) && value.height > 0) {
        cache.set(key, value);
      }
    }
    console.log(`[dimensions] loaded ${cache.size} ratio cache entries`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[dimensions] failed to load ratio cache:', error);
    }
  }
}

function scheduleCacheSave(): void {
  dirty = true;
  if (saveTimer) {
    return;
  }

  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void saveCache().catch((error) => {
      console.warn('[dimensions] failed to save ratio cache:', error);
    });
  }, 1000);
  saveTimer.unref?.();
}

async function saveCache(): Promise<void> {
  if (!dirty) {
    return;
  }

  dirty = false;
  const filePath = dimensionsCachePath();
  const tmpPath = `${filePath}.tmp`;
  const data: PersistedDimensionsCache = {
    version: 1,
    entries: Object.fromEntries(cache),
  };

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(tmpPath, JSON.stringify(data));
  await fs.promises.rename(tmpPath, filePath);
}

function readCachedDimensions(asset: string | AssetDimensionDescriptor, serverUrl: string): DimensionsCacheRecord | null {
  const descriptor = normalizeAsset(asset);
  return cache.get(cacheKey(serverUrl, descriptor)) ?? null;
}

async function probeAssetDimensions(
  asset: string | AssetDimensionDescriptor,
  token: string,
  serverUrl: string,
): Promise<Dimensions | null> {
  const descriptor = normalizeAsset(asset);
  const key = cacheKey(serverUrl, descriptor);
  const cached = readCachedDimensions(descriptor, serverUrl);
  // If we already have both dimensions AND thumbhash, nothing more to do
  if (cached?.thumbhash != null) {
    return { width: cached.width, height: cached.height };
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      // icodec=webp: lomod serves its pre-generated 75px webp (smaller than JPEG). sharp decodes webp fine.
      const url = `${serverUrl}/asset/preview/${encodeURIComponent(descriptor.name)}?token=${token}&width=75&height=0&icodec=webp`;

      // Download the small preview buffer — one HTTP call gives us both dimensions and thumbhash
      const response = await lomoFetch(url);
      if (!response.ok) {
        return null;
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      let width: number;
      let height: number;
      let thumbhash: string | null = null;

      try {
        // Use sharp: extract RGBA pixels for thumbhash + read dimensions in one pass
        const s = getSharp();
        const { data, info } = await s(buffer)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        width = info.width;
        height = info.height;

        const hashBytes = rgbaToThumbHash(info.width, info.height, data);
        thumbhash = Buffer.from(hashBytes).toString('base64');
      } catch {
        // sharp unavailable — fall back to probe-image-size for dimensions only
        const result = await probe(buffer as any);
        width = result.width;
        height = result.height;
      }

      cacheDimensions(descriptor, width, height, serverUrl, thumbhash);
      return { width, height };
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}

export async function getCachedAssetRatios(
  assets: Array<string | AssetDimensionDescriptor>,
  serverUrl: string,
): Promise<Map<string, AssetCacheEntry>> {
  await ensureCacheLoaded();

  const result = new Map<string, AssetCacheEntry>();
  for (const asset of assets) {
    const descriptor = normalizeAsset(asset);
    const cached = readCachedDimensions(descriptor, serverUrl);
    if (cached && cached.height > 0) {
      result.set(descriptor.name, {
        ratio: cached.width / cached.height,
        thumbhash: cached.thumbhash ?? null,
      });
    }
  }

  return result;
}

export function prefetchMissingAssetRatios(
  assets: Array<string | AssetDimensionDescriptor>,
  token: string,
  serverUrl: string,
  concurrency = 8,
): void {
  void (async () => {
    await ensureCacheLoaded();

    let queued = 0;
    for (const asset of assets) {
      const descriptor = normalizeAsset(asset);
      const key = cacheKey(serverUrl, descriptor);
      // Skip only if thumbhash is already present — entries with dims but no thumbhash must be re-probed
      const existing = readCachedDimensions(descriptor, serverUrl);
      if ((existing?.thumbhash != null) || inflight.has(key) || prefetchQueue.has(key)) {
        continue;
      }
      prefetchQueue.set(key, { asset: descriptor, token, serverUrl });
      queued += 1;
    }

    if (queued === 0) {
      return;
    }

    console.log(`[dimensions] queued ${queued} missing ratio(s), pending=${prefetchQueue.size}`);
    schedulePrefetchDrain(concurrency);
  })().catch((error) => {
    console.warn('[dimensions] failed to queue background ratio probe:', error);
  });
}

function schedulePrefetchDrain(concurrency: number): void {
  if (prefetchRunning || prefetchTimer) {
    return;
  }

  prefetchTimer = setTimeout(() => {
    prefetchTimer = undefined;
    void drainPrefetchQueue(concurrency).catch((error) => {
      console.warn('[dimensions] background ratio probe failed:', error);
    });
  }, 200);
  prefetchTimer.unref?.();
}

async function drainPrefetchQueue(concurrency: number): Promise<void> {
  if (prefetchRunning) {
    return;
  }

  prefetchRunning = true;
  try {
    while (prefetchQueue.size > 0) {
      const batch = Array.from(prefetchQueue.entries()).slice(0, Math.max(1, concurrency));
      for (const [key] of batch) {
        prefetchQueue.delete(key);
      }

      await Promise.all(
        batch.map(([, item]) => probeAssetDimensions(item.asset, item.token, item.serverUrl)),
      );
    }
    await saveCache();
  } finally {
    prefetchRunning = false;
    if (prefetchQueue.size > 0) {
      schedulePrefetchDrain(concurrency);
    }
  }
}

/**
 * Get dimensions for multiple assets in parallel with concurrency limit.
 * Returns a Map of assetName -> ratio (width/height).
 */
export async function getAssetRatios(
  assets: Array<string | AssetDimensionDescriptor>,
  token: string,
  serverUrl: string,
  concurrency = 10,
): Promise<Map<string, number>> {
  await ensureCacheLoaded();

  for (let i = 0; i < assets.length; i += concurrency) {
    const batch = assets.slice(i, i + concurrency);
    await Promise.all(batch.map((asset) => probeAssetDimensions(asset, token, serverUrl)));
  }

  return getCachedAssetRatios(assets, serverUrl);
}

/**
 * Store dimensions (and optional thumbhash) in cache.
 * Called from probeAssetDimensions and from assets.ts when full-resolution dimensions are known.
 */
export function cacheDimensions(
  asset: string | AssetDimensionDescriptor,
  width: number,
  height: number,
  serverUrl: string,
  thumbhash?: string | null,
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return;
  }

  const descriptor = normalizeAsset(asset);
  const key = cacheKey(serverUrl, descriptor);
  const existing = cache.get(key);
  cache.set(key, {
    width,
    height,
    // Preserve existing thumbhash if we don't have a new one
    thumbhash: thumbhash !== undefined ? thumbhash : (existing?.thumbhash ?? null),
    updatedAt: new Date().toISOString(),
  });
  scheduleCacheSave();
}

/**
 * Check if thumbhash is already cached for an asset (used by thumbnail endpoint
 * to decide whether to compute it from the served buffer).
 */
export function readCachedThumbhash(
  asset: string | AssetDimensionDescriptor,
  serverUrl: string,
): string | null {
  const descriptor = normalizeAsset(asset);
  return cache.get(cacheKey(serverUrl, descriptor))?.thumbhash ?? null;
}

/**
 * Compute thumbhash from an image buffer and store it alongside dimensions.
 * Called by the thumbnail endpoint after serving a buffer — zero extra HTTP cost.
 * Fire-and-forget: does not block the HTTP response.
 */
export function computeAndStoreThumbhash(
  buffer: Buffer,
  asset: string | AssetDimensionDescriptor,
  serverUrl: string,
): void {
  void (async () => {
    try {
      const s = getSharp();
      const { data, info } = await s(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const hashBytes = rgbaToThumbHash(info.width, info.height, data);
      const thumbhash = Buffer.from(hashBytes).toString('base64');
      cacheDimensions(asset, info.width, info.height, serverUrl, thumbhash);
    } catch {
      // Sharp unavailable or bad image — skip silently
    }
  })();
}
