import React, { useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
// import GridView from './ui/GridView'
import ImageGrid from './ui/ImageGrid'
import MUILoginForm from './ui/MUILoginForm'

import GridScrollBar from './ui/gridview/GridScrollBar'
import { PhotoSectionId, PhotoSectionById, PhotoSection, LoadedPhotoSection  } from './common/CommonTypes'; // Ensure the correct path
import { GridLayout, GridSectionLayout } from './ui/UITypes'; // Ensure the correct path


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

    // Mock data for GridScrollBar using the provided interfaces
  const gridLayout: GridLayout = {
    fromSectionIndex: 0,
    toSectionIndex: 2,
    sectionLayouts: [
      {
        left: 0,
        top: 0,
        width: 500,
        height: 300,
        fromBoxIndex: 0,
        toBoxIndex: 3,
        boxes: [
          { aspectRatio: 1.5, left: 0, top: 0, width: 160, height: 106 },
          { aspectRatio: 0.75, left: 170, top: 0, width: 80, height: 106 },
          { aspectRatio: 2, left: 260, top: 0, width: 240, height: 106 }
        ],
        scaleFactor: 1.0
      },
      {
        left: 0,
        top: 310,
        width: 500,
        height: 300,
        fromBoxIndex: 3,
        toBoxIndex: 5,
        boxes: [
          { aspectRatio: 1.33, left: 0, top: 0, width: 200, height: 150 },
          { aspectRatio: 0.66, left: 210, top: 0, width: 100, height: 150 }
        ],
        scaleFactor: 1.0
      }
    ]
  };

  // Assuming a basic transformation function
  // const transformToPhotoSection = (layout: GridSectionLayout, index: number): PhotoSection | LoadedPhotoSection => {
  //   return {
  //     id: `section-${index}` as PhotoSectionId,
  //     title: `Section ${index + 1}`,
  //     photos: layout.boxes ? layout.boxes.map((box, boxIndex) => ({
  //       id: boxIndex,
  //       master_dir: '/mock/path',
  //       master_filename: `image-${boxIndex}.jpg`,
  //       master_width: box.width,
  //       master_height: box.height,
  //       master_is_raw: 0,
  //       edited_width: null,
  //       edited_height: null,
  //       date_section: '2024-08-17',
  //       created_at: Date.now(),
  //       // Add more mock fields as needed
  //     })) : [],
  //   };
  // };

  // Transform GridSectionLayout into a basic PhotoSection or LoadedPhotoSection structure
  const transformToPhotoSection = (layout: GridSectionLayout, index: number): PhotoSection | LoadedPhotoSection => {
    // Return a mock structure that aligns with what PhotoSection or LoadedPhotoSection expects
    return {
      id: `section-${index}` as PhotoSectionId,
      // Adjust these fields based on the actual structure of PhotoSection or LoadedPhotoSection
      title: `Section ${index + 1}`,
      // Add additional properties if required by the PhotoSection or LoadedPhotoSection
    } as PhotoSection; // Cast to PhotoSection or LoadedPhotoSection
  };

  const sectionById: PhotoSectionById = gridLayout.sectionLayouts.reduce((acc, section, index) => {
    acc[`section-${index}` as PhotoSectionId] = transformToPhotoSection(section, index);
    return acc;
  }, {} as PhotoSectionById);

  const sectionIds: PhotoSectionId[] = Object.keys(sectionById) as PhotoSectionId[];

  const viewportHeight = 1080; // Adjust to your UI needs
  const contentHeight = 610; // Total scrollable content height
  const [scrollTop, setScrollTop] = useState(0);

  const handleScrollTopChange = (newScrollTop: number) => {
    setScrollTop(newScrollTop);
    console.log('Scroll top changed:', newScrollTop);
  };

  // const sectionById: PhotoSectionById = gridLayout.sectionLayouts.reduce((acc, section, index) => {
  //   acc[`section-${index}` as PhotoSectionId] = transformToPhotoSection(section, index);
  //   return acc;
  // }, {} as PhotoSectionById);

  // const sectionIds: PhotoSectionId[] = Object.keys(sectionById) as PhotoSectionId[];

  // const viewportHeight = 600; // Adjust to your UI needs
  // const contentHeight = 610; // Total scrollable content height
  // const [scrollTop, setScrollTop] = useState(0);
  // return <div>{isLoggedIn ? <ImageGrid imageUrls={imageUrls}/> : <MUILoginForm onAssetsFetched={handleAssetsFetched}/>}</div>

  return (
    <div>
      {false ?
        <ImageGrid imageUrls={imageUrls} />
      :
        // Render GridScrollBar when not logged in
        <GridScrollBar
          className=""
          gridLayout={gridLayout}
          sectionIds={sectionIds}
          sectionById={sectionById}
          viewportHeight={viewportHeight}
          contentHeight={contentHeight}
          scrollTop={scrollTop}
          setScrollTop={setScrollTop}
        />
      }
    </div>
  )
}

export default App
