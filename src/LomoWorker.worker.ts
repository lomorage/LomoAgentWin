import { listAllAssets } from './logic/LomoService'
import localforage from 'localforage'

const LomoWorker: Worker = self as any

self.addEventListener('message', (event: MessageEvent) => {

  switch (event.data.command) {
    case 'fetchAllAssets':
      listAllAssets(event.data.token)
        .then((data) => {
          localforage.setItem('assets', data).then(() => {
            ;(self as any).postMessage({ status: 'success', command: 'fetchAllAssets', result: data })
          })
        })
        .catch((error) => {
          ;(self as any).postMessage({ status: 'error', command: 'fetchAllAssets', error: error.message })
        })
      break

    case 'getAssets':
      localforage.getItem('assets')
      .then((value: any) => {
        (self as any).postMessage({ status: 'success', value });
      }).catch((error: Error) => {
        (self as any).postMessage({ status: 'error', error: error.message });
      })
  }

})

export default null as any // to avoid *.worker.ts is not a module error
