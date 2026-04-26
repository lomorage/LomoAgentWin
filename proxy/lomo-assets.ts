import fetch from 'node-fetch';

const DEFAULT_ASSET_DATE = '2000-01-01T00:00:00Z';
const FAVORITE_STATUS_MASK = 8;

export interface LomoAssetDateInfo {
  name: string;
  date: string;
}

export interface LomoAssetSummary extends LomoAssetDateInfo {
  status: number;
}

interface LomoAssetMetadata {
  Date?: string;
}

interface LomoDayDetail {
  Assets?: Array<{ Name: string; Status: number }>;
}

export function isFavoriteStatus(status: number): boolean {
  return (status & FAVORITE_STATUS_MASK) !== 0;
}

export function parseBooleanQueryValue(value: unknown): boolean | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

export async function fetchAssetDateInfos(
  serverUrl: string,
  token: string,
  assetNames: string[],
): Promise<LomoAssetDateInfo[]> {
  const assets: LomoAssetDateInfo[] = [];

  for (let i = 0; i < assetNames.length; i += 10) {
    const batch = assetNames.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        try {
          const metaRes = await fetch(`${serverUrl}/asset/metadata/${encodeURIComponent(name)}?token=${token}`);
          if (metaRes.ok) {
            const meta = await metaRes.json() as LomoAssetMetadata;
            return { name, date: meta.Date || DEFAULT_ASSET_DATE };
          }
        } catch {
          // Ignore individual metadata failures and fall back to a stable default date.
        }

        return { name, date: DEFAULT_ASSET_DATE };
      }),
    );

    assets.push(...batchResults);
  }

  return assets;
}

export async function fetchAssetStatusMapForDates(
  serverUrl: string,
  token: string,
  assets: LomoAssetDateInfo[],
): Promise<Map<string, number>> {
  const dayRequests = new Map<string, { year: number; month: number; day: number }>();

  for (const asset of assets) {
    const date = new Date(asset.date);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const key = `${year}-${month}-${day}`;

    if (!dayRequests.has(key)) {
      dayRequests.set(key, { year, month, day });
    }
  }

  const dayResults = await Promise.all(
    Array.from(dayRequests.values()).map(async ({ year, month, day }) => {
      try {
        const res = await fetch(`${serverUrl}/assets/merkletree/${year}/${month}/${day}?token=${token}`);
        if (!res.ok) {
          return [];
        }

        const dayData = await res.json() as LomoDayDetail;
        return dayData.Assets || [];
      } catch {
        return [];
      }
    }),
  );

  const statusByAssetName = new Map<string, number>();
  for (const dayAssets of dayResults) {
    for (const asset of dayAssets) {
      statusByAssetName.set(asset.Name, asset.Status);
    }
  }

  return statusByAssetName;
}

export async function fetchAssetSummaries(
  serverUrl: string,
  token: string,
  assetNames: string[],
): Promise<LomoAssetSummary[]> {
  const datedAssets = await fetchAssetDateInfos(serverUrl, token, assetNames);
  const statusMap = await fetchAssetStatusMapForDates(serverUrl, token, datedAssets);

  return datedAssets.map((asset) => ({
    ...asset,
    status: statusMap.get(asset.name) ?? 0,
  }));
}
