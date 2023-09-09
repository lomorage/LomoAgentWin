import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './app'
import LoginForm from './ui/LoginForm'

const container = document.querySelector('#root')
const root = createRoot(container!)
// root.render(<App name='AISNOTE LOMO' age={25}/>)

const renderApp = (isLoggedIn: Boolean) => {
    root.render(
        <React.StrictMode>
            <App name='AISNOTE LOMO' age = {25}  />
        </React.StrictMode>
    )
}

// default is not-logged in
renderApp(false)



const isLoggedIn = false

if (isLoggedIn) {

} else {
    root.render(
        <React.StrictMode>
            <LoginForm />
        </React.StrictMode>

    )
}
