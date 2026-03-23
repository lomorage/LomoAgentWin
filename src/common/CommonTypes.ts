export type PhotoId = number

export interface Photo {
  id: PhotoId,
  /** The directory of the original image. Example: '/User/me/Pictures' */
  master_dir: string,
  /** The filename (without directory) of the original image. Example: 'IMG_9700.JPG' */
  master_filename: string,
  /** The width of the original image - only with EXIF rotation applied (in px). */
  master_width: number
  /** The height of the original image - only with EXIF rotation applied (in px). */
  master_height: number
  /** Whether the master image has a raw format */
  master_is_raw: 0 | 1,
  /** The width of the original image - after EXIF rotation and all PhotoWork have been applied (in px). */
  edited_width: number | null
  /** The height of the original image - after EXIF rotation and all PhotoWork have been applied (in px). */
  edited_height: number | null
  /** Example: '2016-09-18' */
  date_section: string,
  /** The timestamp when the photo was created */
  created_at: number,
  /** The timestamp when the photo was modified */
  updated_at: number,
  /** The timestamp when the photo was imported */
  imported_at: number,
  /** Whether the image is flagged. */
  flag: 0 | 1,
  /** Example: 0 */
  trashed: 0 | 1,
}
export type PhotoById = { [K in PhotoId]: Photo }

export type PhotoSectionId = string

export interface PhotoSection {
  id: PhotoSectionId
  title: string
  count: number
}

export interface PhotoSet {
  photoIds: PhotoId[]
  photoData: PhotoById
}
export interface LoadedPhotoSection extends PhotoSection, PhotoSet {
}

export function isLoadedPhotoSection(section: PhotoSection | null | undefined | false): section is LoadedPhotoSection {
  return !!(section && (section as any).photoIds)
}

export type PhotoSectionById = { [K in PhotoSectionId]: PhotoSection | LoadedPhotoSection }

