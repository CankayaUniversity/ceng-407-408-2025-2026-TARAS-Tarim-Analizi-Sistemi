import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const DEFAULT_EXPORT_SIZE = 256;
const DEFAULT_QUALITY = 0.92;

interface PrepareOptions {
  width: number;
  height: number;
  exportSize?: number;
  quality?: number;
}

export async function prepareDiseaseImageForUpload(
  imageUri: string,
  {
    width,
    height,
    exportSize = DEFAULT_EXPORT_SIZE,
    quality = DEFAULT_QUALITY,
  }: PrepareOptions,
): Promise<string> {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  const cropSize = Math.min(safeWidth, safeHeight);
  const cropOriginX = Math.max(0, Math.floor((safeWidth - cropSize) / 2));
  const cropOriginY = Math.max(0, Math.floor((safeHeight - cropSize) / 2));

  const result = await manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: cropOriginX,
          originY: cropOriginY,
          width: cropSize,
          height: cropSize,
        },
      },
      { resize: { width: exportSize, height: exportSize } },
    ],
    {
      compress: quality,
      format: SaveFormat.JPEG,
    },
  );

  return result.uri;
}
