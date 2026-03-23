import React, { useEffect, useState } from 'react';
import ImageList from '@mui/material/ImageList';
import ImageListItem from '@mui/material/ImageListItem';

interface ImageGridProps {
  imageUrls: string[];
}

const srcset = (image: string, size: number, rows = 1, cols = 1) => ({
  // src: `${image}?w=${size * cols}&h=${size * rows}&fit=crop&auto=format`,
  src: `${image}`,
  srcSet: `${image}?w=${size * cols}&h=${size * rows}&fit=crop&auto=format&dpr=2 2x`,
});

const ImageGrid: React.FC<ImageGridProps> = ({ imageUrls }) => {
  const [images, setImages] = useState<{ img: string; rows?: number; cols?: number }[]>([]);

  useEffect(() => {
    // Transform image URLs into the format expected by ImageList
    const transformedImages = imageUrls.map((url, index) => ({
      img: url,
      rows: 1,
      cols: 1,
    }));
    setImages(transformedImages);
  }, [imageUrls]);

  return (
    <ImageList
      sx={{ width: '100vw', height: '100vh', padding: 1 }}
      variant="quilted"
      cols={4}
      rowHeight={121}
    >
      {images.map((item, index) => (
        <ImageListItem key={index} cols={item.cols || 1} rows={item.rows || 1}>
          <img
            {...srcset(item.img, 121, item.rows, item.cols)}
            alt={`Image ${index}`}
            loading="lazy"
          />
        </ImageListItem>
      ))}
    </ImageList>
  );
};

export default ImageGrid;
