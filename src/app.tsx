import exp from 'constants'
import cat from './cat.jpg'

import React from 'react'

interface IProps {
  name: string,
  age: number
}

function App(props: IProps) {
  const {name, age} = props

  return (
    <div className='app'>
      <span>{`Hello! I'am ${name}, ${age} years old!`}</span>
    </div>
  )
}

export default App
