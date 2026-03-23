import probe from 'probe-image-size';

// In-memory cache: assetName -> { width, height }
const cache = new Map<string, { width: number; height: number }>();

/**
 * Get image dimensions for a single asset.
 * Uses cache if available, otherwise probes the small preview.
 */
export async function getAssetDimensions(
  assetName: string,
  token: string,
  serverUrl: string,
): Promise<{ width: number; height: number } | null> {
  const cached = cache.get(assetName);
  if (cached) {
    return cached;
  }

  try {
    // Use small preview (75px wide, proportional height) — fast to probe
    const url = `${serverUrl}/asset/preview/${encodeURIComponent(assetName)}?token=${token}&width=75&height=0`;
    const result = await probe(url);
    const dims = { width: result.width, height: result.height };
    cache.set(assetName, dims);
    return dims;
  } catch {
    return null;
  }
}

/**
 * Get dimensions for multiple assets in parallel with concurrency limit.
 * Returns a Map of assetName -> ratio (width/height).
 */
export async function getAssetRatios(
  assetNames: string[],
  token: string,
  serverUrl: string,
  concurrency = 10,
): Promise<Map<string, number>> {
  const ratios = new Map<string, number>();

  // Process in batches
  for (let i = 0; i < assetNames.length; i += concurrency) {
    const batch = assetNames.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (name) => {
        const dims = await getAssetDimensions(name, token, serverUrl);
        return { name, dims };
      }),
    );
    for (const { name, dims } of results) {
      if (dims && dims.height > 0) {
        ratios.set(name, dims.width / dims.height);
      }
    }
  }

  return ratios;
}

/**
 * Store dimensions in cache (e.g., from a larger preview probe).
 */
export function cacheDimensions(assetName: string, width: number, height: number) {
  cache.set(assetName, { width, height });
}
