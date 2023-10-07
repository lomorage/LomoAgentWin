import React, { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'

import { AuthProvider } from './AuthContext'
import LomoWorker from './LomoWorker.worker'

// import './index.css'

// register service worker
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/LomoSW.js');
// }

const lomoClientWorker = new LomoWorker()

if (lomoClientWorker) {
  lomoClientWorker.onmessage = (e: MessageEvent) => {
    const result = e.data // received result from the worker thread
    console.log('Received from worker:', result)
  }

  lomoClientWorker.postMessage('hello world from main thread')
}

const container = document.querySelector('#root')
const root = createRoot(container!)

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <App name="AISNOTE LOMO" age={25} />
      </AuthProvider>
    </React.StrictMode>,
  )
}

// Render the app
renderApp()
