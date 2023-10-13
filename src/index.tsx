import React, { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'

import { AuthProvider } from './AuthContext'

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
