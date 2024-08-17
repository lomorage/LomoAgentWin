import React from 'react';
import { Grid, Paper, Typography } from '@mui/material';

interface ImageData {
  id: number;
  title: string;
  imageUrl: string;
}

const images: ImageData[] = [
  // Array of image data. Example:
  // { id: 1, title: 'Image 1', imageUrl: 'http://example.com/image1.jpg' },
  // { id: 2, title: 'Image 2', imageUrl: 'http://example.com/image2.jpg' },
  // ...
];

const GridView: React.FC = () => {
  return (
    <div style={{ padding: '20px' }}>
      <Typography variant="h4" gutterBottom>
        Welcome! Here are your images:
      </Typography>
      <Grid container spacing={3}>
        {images.map((image) => (
          <Grid item xs={12} sm={6} md={4} key={image.id}>
            <Paper elevation={3} style={{ padding: '20px' }}>
              <img src={image.imageUrl} alt={image.title} style={{ width: '100%', height: 'auto' }} />
              <Typography variant="h6" style={{ marginTop: '10px' }}>
                {image.title}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </div>
  );
};

export default GridView;
