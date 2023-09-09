import React, { useState } from 'react'
import { login } from '../logic/LomoService' // Import the login function from your API logic

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }

  const handleLogin = async () => {
    setIsLoading(true)

    try {
      const response = await login(username, password) // Call the login function

      // Handle successful login response here (e.g., set user state, redirect, etc.)
      console.log('Login successful!', response)
    } catch (error) {
      // Handle login error (e.g., display an error message)
      console.error('Login failed:', error)
    } finally {
      setIsLoading(false) // Set loading to false when the response is received
    }
  }

  return (
    <div>
      <h2>Login</h2>
      <div>
        <label>Username:</label>
        <input type="text" value={username} onChange={handleUsernameChange} />
      </div>
      <div>
        <label>Password:</label>
        <input type="password" value={password} onChange={handlePasswordChange} />
      </div>
      <button onClick={handleLogin} disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
    </div>
  )
}

export default LoginForm
