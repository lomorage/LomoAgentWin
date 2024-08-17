export interface Asset {
  Name: string
  Hash: string
  Device: string
  Status: number
  Longitude: number
  Latitude: number
  Date: string
}

export interface AssetBucket {
  year: number
  month: number
  day: number
  assets: Asset[]
}

export function mapToAsset(obj: any): Asset {
  return {
      Name: obj.Name,
      Hash: obj.Hash,
      Device: obj.Device,
      Status: obj.Status,
      Longitude: obj.Longitude,
      Latitude: obj.Latitude,
      Date: obj.Date
  };
}
