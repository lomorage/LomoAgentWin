import LomoWorker from '../LomoWorker.worker'

export const lomoClientWorker = new LomoWorker();

export const postMessageToWorker = (message: any): void => {
  lomoClientWorker.postMessage(message);
};

export const initializeWorkerListener = (callback: (event: MessageEvent) => void): void => {
  lomoClientWorker.onmessage = callback;
};
