import React, { useMemo } from 'react'
import { useAuth } from './AuthContext'
import GridView from './ui/GridView'
import MUILoginForm from './ui/MUILoginForm'

interface IProps {
  name: string
  age: number
}

const App: React.FC<IProps> = (props: IProps) => {
  const { name, age } = props
  const { isLoggedIn } = useAuth()

  return <div>{isLoggedIn ? <GridView /> : <MUILoginForm />}</div>
}

export default App
