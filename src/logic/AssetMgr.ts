import { AssetList, YearList } from '../logic/LomoService' // Import the login function from your API logic

import LomoWorker from '../LomoWorker.worker'

/**
 * signletone class
 */
class AssetMgr {

  fetchAndStoreAssets(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = 'fetchAllAssets'
      this.createCallback(command, resolve, reject)
      this.worker.postMessage({ command, token })
    })
  }

  getAssets(): Promise<AssetList> {
    return new Promise((resolve, reject) => {
      const command = 'getAssets'
      this.createCallback(command, resolve, reject)
      this.worker.postMessage({ command })
    })
  }

  //////////////////////////////////
  // private below
  //////////////////////////////////
  private static instance: AssetMgr
  private worker: Worker
  private messageListeners: { [command: string]: ((data: any) => void)[] } = {}

  private constructor() {
    this.worker = new LomoWorker()
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      const listeners = this.messageListeners[data.command]
      if (listeners) {
        listeners.forEach((callback) => callback(data))
      }
    }
  }

  public static getInstance(): AssetMgr {
    if (!AssetMgr.instance) {
      AssetMgr.instance = new AssetMgr()
    }
    return AssetMgr.instance
  }

  private createCallback(command: string, resolve: (value: any) => void, reject: (reason?: any) => void) {
    const callback = (data: any) => {
      this.unregisterMessageListener(command, callback)

      if (data.status === 'success') {
        resolve(data.result)
      } else if (data.status === 'error') {
        reject(data.error)
      }
    }

    this.registerMessageListener(command, callback)
  }

  private registerMessageListener(command: string, callback: (data: any) => void): void {
    if (!this.messageListeners[command]) {
      this.messageListeners[command] = []
    }

    this.messageListeners[command].push(callback)
  }

  private unregisterMessageListener(command: string, callback: (data: any) => void): void {
    const listeners = this.messageListeners[command]
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }
}

export const assetMgr = AssetMgr.getInstance();
