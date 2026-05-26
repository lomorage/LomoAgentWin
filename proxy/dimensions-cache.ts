import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import probe from 'probe-image-size';

export type AssetDimensionDescriptor = {
  name: string;
  hash?: string | null;
};

type Dimensions = {
  width: number;
  height: number;
};

type DimensionsCacheRecord = Dimensions & {
  updatedAt: string;
};

type PersistedDimensionsCache = {
  version: 1;
  entries: Record<string, DimensionsCacheRecord>;
};

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

function readCachedDimensions(asset: string | AssetDimensionDescriptor, serverUrl: string): Dimensions | null {
  const descriptor = normalizeAsset(asset);
  const cached = cache.get(cacheKey(serverUrl, descriptor));
  return cached ? { width: cached.width, height: cached.height } : null;
}

async function probeAssetDimensions(
  asset: string | AssetDimensionDescriptor,
  token: string,
  serverUrl: string,
): Promise<Dimensions | null> {
  const descriptor = normalizeAsset(asset);
  const key = cacheKey(serverUrl, descriptor);
  const cached = readCachedDimensions(descriptor, serverUrl);
  if (cached) {
    return cached;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      const url = `${serverUrl}/asset/preview/${encodeURIComponent(descriptor.name)}?token=${token}&width=75&height=0`;
      const result = await probe(url);
      const dims = { width: result.width, height: result.height };
      cacheDimensions(descriptor, dims.width, dims.height, serverUrl);
      return dims;
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
): Promise<Map<string, number>> {
  await ensureCacheLoaded();

  const ratios = new Map<string, number>();
  for (const asset of assets) {
    const descriptor = normalizeAsset(asset);
    const dims = readCachedDimensions(descriptor, serverUrl);
    if (dims && dims.height > 0) {
      ratios.set(descriptor.name, dims.width / dims.height);
    }
  }

  return ratios;
}

export function prefetchMissingAssetRatios(
  assets: Array<string | AssetDimensionDescriptor>,
  token: string,
  serverUrl: string,
  concurrency = 1,
): void {
  void (async () => {
    await ensureCacheLoaded();

    let queued = 0;
    for (const asset of assets) {
      const descriptor = normalizeAsset(asset);
      const key = cacheKey(serverUrl, descriptor);
      if (readCachedDimensions(descriptor, serverUrl) || inflight.has(key) || prefetchQueue.has(key)) {
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
  }, 3000);
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
 * Store dimensions in cache (e.g., from a larger preview probe).
 */
export function cacheDimensions(
  asset: string | AssetDimensionDescriptor,
  width: number,
  height: number,
  serverUrl: string,
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return;
  }

  const descriptor = normalizeAsset(asset);
  cache.set(cacheKey(serverUrl, descriptor), {
    width,
    height,
    updatedAt: new Date().toISOString(),
  });
  scheduleCacheSave();
}
