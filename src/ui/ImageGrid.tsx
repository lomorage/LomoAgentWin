import React, { useEffect, useRef, useState } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';

interface ImageGridProps {
  imageUrls: string[];
}

const ImageGrid: React.FC<ImageGridProps> = ({ imageUrls }) => {
  const [images, setImages] = useState<string[]>([]);
  const gridRef = useRef<any>(null);

  const [gridDimensions, setGridDimensions] = useState({ width: 0, height: 0 });

  // useEffect(() => {
  //   // Fetch image URLs from IndexedDB or any other source
  //   async function fetchImages() {
  //     // Simulate fetching from IndexedDB
  //     const fetchedImages = await fetchImagesFromIndexedDB();
  //     setImages(fetchedImages);
  //   }

  //   fetchImages();
  // }, []);

  useEffect(() => {
    console.log("Image URLs received:", imageUrls); // Log incoming image URLs
    setImages(imageUrls);

    // Set grid dimensions based on viewport size
    const updateGridDimensions = () => {
      setGridDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateGridDimensions();
    window.addEventListener('resize', updateGridDimensions);

    return () => window.removeEventListener('resize', updateGridDimensions);
  }, [imageUrls]);


    // Log the images state to ensure it's being set correctly
    useEffect(() => {
      console.log("Images state:", images);
    }, [images]);


  // Example function to simulate fetching images from IndexedDB
  const fetchImagesFromIndexedDB = async (): Promise<string[]> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(imageUrls); // Replace with actual IndexedDB fetching logic
      }, 1000);
    });
  };

  // Lazy load the images
  const loadImage = (img: HTMLImageElement) => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          img.src = img.dataset.src!;
          observer.unobserve(entry.target);
        }
      });
    });
    observer.observe(img);
  };

  const Cell = ({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
    const index = rowIndex * 5 + columnIndex; // Adjust columns count here
    const imageUrl = images[index];

    return (
      <div style={style}>
        {imageUrl ? (
          <img
            data-src={imageUrl}
            alt={`Image ${index}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            className="lazy-load"
            ref={img => img && loadImage(img)}
          />
        ) : (
          <div style={{ textAlign: 'center', lineHeight: '200px' }}>Loading...</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>
      <Grid
        ref={gridRef}
        columnCount={5} // Number of columns
        columnWidth={200} // Width of each cell
        height={gridDimensions.height} // Use the viewport height
        rowCount={Math.ceil(images.length / 5)} // Number of rows
        rowHeight={200} // Height of each row
        width={gridDimensions.width} // Use the viewport width
      >
        {Cell}
      </Grid>
    </div>
  );
};

export default ImageGrid;
