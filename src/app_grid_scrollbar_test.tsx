import React, { useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
// import GridView from './ui/GridView'
import ImageGrid from './ui/ImageGrid'
import MUILoginForm from './ui/MUILoginForm'

interface IProps {
  name: string
  age: number
}

const App: React.FC<IProps> = (props: IProps) => {
  const { name, age } = props
  const { isLoggedIn } = useAuth()
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const handleAssetsFetched = (urls: string[]) => {
    setImageUrls(urls);
  };


  return <div>{isLoggedIn ? <ImageGrid imageUrls={imageUrls}/> : <MUILoginForm onAssetsFetched={handleAssetsFetched}/>}</div>
}

export default App
