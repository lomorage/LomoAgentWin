import { listAllAssets, listAllAssetsByYearMonth } from './logic/LomoService'
import { lomoDb } from './logic/LomoDb'

import localforage from 'localforage'

const LomoWorker: Worker = self as any

let gTotalCount = 0
async function fetchAllAssetsByYearMonth(token: string, year: string, month: string) {
  // Check if the 'allAssets' parameter contains expected properties like 'Years'

  const response = await listAllAssetsByYearMonth(token, year, month)
  const allDays = response.Days

  // console.log(allDays)
  // allDays.forEach((assetListObj) => {
  //   if (assetListObj) {
  //     let assets = assetListObj.Assets
  //     if (assets) {
  //       assets.forEach((asset) => {
  //         // console.log(`${asset.Date}-${asset.Name}`)
  //         lomoDb.saveAssetFromJsonObj(asset)
  //         gTotalCount++
  //       })
  //     }
  //   }
  // })

  //!!forEach above can not be sync. here on worker thread better to do as sync
  for (const assetListObj of allDays) {
    if (assetListObj) {
      const assets = assetListObj.Assets
      if (assets) {
        for (const asset of assets) {
          await lomoDb.saveAssetFromJsonObj(asset)
          gTotalCount++
        }
      }
    }
  }
}

function doFetchAllAssets(token: string, allAssets: any, callback: any) {
  // Check if the 'allAssets' parameter contains expected properties like 'Years'
  if (!allAssets || !Array.isArray(allAssets.Years)) {
    throw new Error('Invalid assets data')
  }
  interface YearMonth {
    year: string
    month: string
  }

  const allYearsMonths: YearMonth[] = allAssets.Years.flatMap((yearObj: any) => {
    if (yearObj && Array.isArray(yearObj.Months)) {
      return yearObj.Months.map((monthObj: any) => ({
        year: yearObj.Year.toString(),
        month: monthObj.Month.toString(),
      }))
    }
    return []
  })

  // Use reduce to chain promises in a sequential manner
  allYearsMonths
    .reduce<Promise<void>>((promiseChain, yearMonth) => {
      return promiseChain.then(() => fetchAllAssetsByYearMonth(token, yearMonth.year, yearMonth.month))
    }, Promise.resolve()) // Start with a resolved promise
    .then(() => {
      callback(gTotalCount)
    })
    .catch((error) => {
      console.error('Error in fetching assets:', error.message)
    })
}

self.addEventListener('message', (event: MessageEvent) => {
  switch (event.data.command) {
    case 'fetchAllAssets':
      listAllAssets(event.data.token)
        .then((data) => {
          localforage.setItem('assets', data).then(() => {
            doFetchAllAssets(event.data.token, data, (totalCount: any) => {
              console.log(`total count = ${totalCount}`)
              ;(self as any).postMessage({
                status: 'success',
                command: 'fetchAllAssets',
                result: data,
                totalCount: totalCount,
              })
            })
          })
        })
        .catch((error) => {
          ;(self as any).postMessage({ status: 'error', command: 'fetchAllAssets', error: error.message })
        })
      break

    case 'getAssetsByYMD':
      let date = event.data.date
      // console.log(`day = ${date.getDay()}, date = ${date.getDate()}`)
      lomoDb
        .getBucket(date.getFullYear(), date.getMonth(), date.getDate())
        .then((bucket) => {
          ;(self as any).postMessage({
            status: 'success',
            command: 'getAssetsByYMD',
            result: bucket,
          })
        })
        .catch((error) => {
          ;(self as any).postMessage({ status: 'error', command: 'getAssetsByYMD', error: error.message })
        })
      break

    case 'getAssets':
      localforage
        .getItem('assets')
        .then((value: any) => {
          ;(self as any).postMessage({ status: 'success', value })
        })
        .catch((error: Error) => {
          ;(self as any).postMessage({ status: 'error', error: error.message })
        })
  }
})

export default null as any // to avoid *.worker.ts is not a module error
