import { Asset, AssetBucket, mapToAsset } from 'Src/logic/AssetTypes' // Adjust the path as needed
import localforage from 'localforage'

class LomoDb {
  private static instance: LomoDb

  private constructor() {
    localforage.config({
      driver: localforage.INDEXEDDB, // Use IndexedDB as the primary storage driver
      name: 'LomoDB',
      version: 1.0,
      storeName: 'assets', // Name of the data store
      description: 'Lomo database for storing assets',
    })
  }

  public static getInstance(): LomoDb {
    if (!LomoDb.instance) {
      LomoDb.instance = new LomoDb()
    }
    return LomoDb.instance
  }

  // key cache
  private keyCache = new Set<string>()

  /////////////////////////////////////////////
  private getYMDHashAsKey(asset: Asset): string {
    const date = new Date(asset.Date) // UTC
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1 // Months are 0-based in JavaScript Date
    const day = date.getUTCDate()
    return `${year}-${month}-${day}-${asset.Hash}`
  }

  private getKey(date: Date, hash: string): string {
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}-${hash}`
  }

  public async saveAssetFromJsonObj(assetObj: any): Promise<void> {
    try {
      const asset = mapToAsset(assetObj)
      await this.saveAsset(asset)
    } catch (error) {
      console.error('saveAssetFromJsonObj>>Error setting asset:', error)
    }
  }

  public async saveAsset(asset: Asset): Promise<void> {
    try {
      const key = this.getYMDHashAsKey(asset)
      if (!this.keyCache.has(key)) {
        await localforage.setItem(key, asset)
        // console.log(`${this.keyCache.size}`)
        this.keyCache.add(key)
      }
    } catch (error) {
      console.error('Error setting asset:', error)
    }
  }

  /**
   * get one asset by local browser timezone's date
   * @param date local browser timezone
   * @param hash
   * @returns
   */
  public async getAsset(date: Date, hash: string): Promise<Asset | null> {
    try {
      const key = this.getKey(date, hash)
      const asset = await localforage.getItem<Asset>(key)
      return asset
    } catch (error) {
      console.error('Error getting asset:', error)
      return null
    }
  }

  /**
   *
   * @param date local browser timezone date
   * @param hash
   */
  public async removeAsset(date: Date, hash: string): Promise<void> {
    try {
      const key = this.getKey(date, hash)
      await localforage.removeItem(key)
    } catch (error) {
      console.error('Error removing asset:', error)
    }
  }

  public async getAssetByKey(key: string): Promise<Asset | null> {
    const asset = await localforage.getItem<Asset>(key)
    return asset || null
  }

  /**
   *
   * @param year local timezone
   * @param month
   * @param day
   * @returns
   */
  public async getBucket(year: number, month: number, day: number): Promise<AssetBucket | null> {
    // Convert input date to its UTC equivalent
    const localDate = new Date(Date.UTC(year, month - 1, day))
    const utcYear = localDate.getUTCFullYear()
    const utcMonth = localDate.getUTCMonth() + 1
    const utcDay = localDate.getUTCDate()

    const keyPrefix = `${utcYear}-${utcMonth}-${utcDay}`
    // const keys = await localforage.keys()
    const keys = Array.from(this.keyCache)
    const assetKeysForTheDay = keys.filter((key) => key.startsWith(keyPrefix))

    const assets: Asset[] = []
    for (const key of assetKeysForTheDay) {
      const asset = await this.getAssetByKey(key)
      if (asset) {
        assets.push(asset)
      }
    }

    if (assets.length > 0) {
      const assetBucket: AssetBucket = {
        year: year,
        month: month,
        day: day,
        assets: assets,
      }
      return assetBucket
    }

    return null
  }

  public async getAssetsByDay(year: number, month: number, day: number): Promise<Asset[]> {
    const bucket = await this.getBucket(year, month, day)
    return bucket ? bucket.assets : []
  }

  public async getAssetsByMonth(year: number, month: number): Promise<Asset[]> {
    let allAssets: Asset[] = []
    const daysInMonth = new Date(year, month, 0).getDate()

    for (let day = 1; day <= daysInMonth; day++) {
      const assets = await this.getAssetsByDay(year, month, day)
      allAssets = allAssets.concat(assets)
    }

    return allAssets
  }
}

export const lomoDb = LomoDb.getInstance()
