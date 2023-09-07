import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './app.js'

const container = document.querySelector('#root')
const root = createRoot(container)
root.render(<App tab='home'/>)
// ReactDOM.render(<App />, document.querySelector('#root'))
