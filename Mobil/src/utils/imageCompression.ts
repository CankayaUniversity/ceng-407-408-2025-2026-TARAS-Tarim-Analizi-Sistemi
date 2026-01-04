import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Compress an image file to reduce its size for transmission
 * @param imageUri - The URI of the image to compress
 * @param maxWidth - The maximum width of the image (default: 720)
 * @param maxHeight - The maximum height of the image (default: 720)
 * @returns The URI of the compressed image
 */
export async function compressImage(
  imageUri: string,
  _targetSizeKB: number = 200,
  maxWidth: number = 720,
  maxHeight: number = 720
): Promise<string> {
  try {
    let currentUri = imageUri;
    let currentQuality = 0.6;

    console.log(`Starting compression for image: ${imageUri}`);

    // Resize and compress the image aggressively
    const resized = await manipulateAsync(
      currentUri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: currentQuality, format: SaveFormat.JPEG }
    );

    currentUri = resized.uri;
    console.log(`After resize to ${maxWidth}x${maxHeight}: ${currentUri}`);

    // Further compress with lower quality
    currentQuality = 0.5;
    const compressed = await manipulateAsync(
      currentUri,
      [],
      { compress: currentQuality, format: SaveFormat.JPEG }
    );

    currentUri = compressed.uri;
    console.log(`Final compressed image: ${currentUri}`);

    return currentUri;
  } catch (error) {
    console.error('Image compression failed:', error);
    // Return original URI if compression fails
    return imageUri;
  }
}
