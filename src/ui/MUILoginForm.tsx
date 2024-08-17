import React, { useState } from 'react'
import { login, listAllAssets } from '../logic/LomoService' // Import the login function from your API logic

import Button from '@mui/material/Button'
import CssBaseline from '@mui/material/CssBaseline'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { Container } from '@mui/material'

import { useAuth } from '../AuthContext' // Don't forget to import your context hook
import { assetMgr } from 'Src/logic/AssetMgr'

const BASE_URL = 'http://192.168.1.73:8000/';

// const [imageUrls, setImageUrls] = useState<string[]>([]);

interface MUILoginFormProps {
  onAssetsFetched: (urls: string[]) => void;
}

const MUILoginForm: React.FC<MUILoginFormProps> = ({ onAssetsFetched }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { logIn } = useAuth()

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }

  const handleLogin = async (event: { preventDefault: () => void; currentTarget: HTMLFormElement | undefined }) => {
    setIsLoading(true)

    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (data.get('username') == null || data.get('password') == null) {
      return
    }

    let username = data.get('username')!!.toString()
    let password = data.get('password')!!.toString()

    try {
      const response = await login(username, password)

      // Handle successful login response here (e.g., set user state, redirect, etc.)
      console.log('Login successful!', response)

      const token = response.Token

      assetMgr
        .fetchAndStoreAssets(response.Token)
        .then((assets) => {
          console.log('All assets get successful!', assets)

          // test to get
          const date = new Date(2023, 7, 16);
          console.log(`test date = ${date}`)

          assetMgr.getAssetsByYMD(date).then(
            (bucket) => {
              console.log('getAssetsByYMD successful!', bucket)

              if (bucket && bucket.assets) {


              // Assuming bucket is an array of asset objects with image URLs
              const urls = bucket?.assets.map(asset =>
                `${BASE_URL}asset/preview/${asset.Name}?token=${token}`); // Modify according to the actual structure of bucket
                onAssetsFetched(urls); // Update state with the fetched URLs

                console.log('getAssetsByYMD successful! onAssetsFetched', urls)

              } else {
                console.warn('No assets found in the bucket.');
                onAssetsFetched([]); // Set an empty array if no assets are found
              }
            }
          ).catch(
            (error) => {
              console.log('getAssetsByYMD fail!', error)
              onAssetsFetched([]); // Set an empty array if no assets are found
            }
          )

        })
        .catch((error) => {
          console.log('All assets get fail!', error)
        })

      logIn()
    } catch (error) {
      // Handle login error (e.g., display an error message)
      console.error('Login failed:', error)
    } finally {
      setIsLoading(false) // Set loading to false when the response is received
    }
  }

  return (
    <Container component="main" maxWidth="lg">
      <Box
        sx={{
          marginTop: 8,
        }}
      >
        <Grid container>
          <CssBaseline />
          <Grid
            item
            xs={false}
            sm={4}
            md={7}
            sx={{
              backgroundImage: 'url(https://source.unsplash.com/random)',
              backgroundRepeat: 'no-repeat',
              backgroundColor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900]),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
            <Box
              sx={{
                my: 8,
                mx: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Typography component="h1" variant="h5">
                Sign in
              </Typography>
              <Box component="form" noValidate onSubmit={handleLogin} sx={{ mt: 1 }}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="username"
                  label="User Name:"
                  name="username"
                  // autoComplete="email"
                  autoFocus
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="Password"
                  type="password"
                  id="password"
                  autoComplete="current-password"
                />
                <FormControlLabel control={<Checkbox value="remember" color="primary" />} label="Remember me" />
                <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
                  Sign In
                </Button>
                <Grid container>
                  <Grid item xs>
                    <Link href="#" variant="body2">
                      Forgot password?
                    </Link>
                  </Grid>

                  {/* <Grid item>
                    <Link href="#" variant="body2">
                      {"Don't have an account? Sign Up"}
                    </Link>
                  </Grid> */}
                </Grid>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Container>
  )
}

export default MUILoginForm
