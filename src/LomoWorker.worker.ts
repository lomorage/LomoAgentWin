import localforage from 'localforage';

const LomoWorker: Worker = self as any

self.addEventListener('message', (event: MessageEvent) => {

    postMessage(event.data);

    switch (event.data.command) {
        case 'setItem':
            localforage.setItem(event.data.key, event.data.value)
                        .then(() => {
                            (self as any).postMessage({ status: 'success' });
                        })
                        .catch((error: Error) => {
                            (self as any).postMessage({ status: 'error', error: error.message });
                        });
            break;

        case 'getItem':
            localforage.getItem(event.data.key)
                        .then((value: any) => {
                            (self as any).postMessage({ status: 'success', value });
                        })
                        .catch((error: Error) => {
                            (self as any).postMessage({ status: 'error', error: error.message });
                        });
            break;

        // ... handle other commands or storage operations
    }
});

export default null as any; // to avoid *.worker.ts is not a module error
