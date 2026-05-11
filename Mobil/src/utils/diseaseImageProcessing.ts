// Cekilen fotografi modele/sunucuya gondermek icin hazirlar.
// JPEG && cap alti → pass-through (EXIF korunur).
// Non-JPEG → re-encode. Cap ustu → tek decode + resize + encode (asagidaki formul).

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

const MAX_BYTES = 5 * 1024 * 1024;      // multer 5 MB sinirina hizali
const TARGET_BYTES = MAX_BYTES * 0.90;
const MIN_LONG_EDGE = 512;
const MAX_QUALITY = 0.92;
const MIN_QUALITY = 0.82;

// Native q≈0.93 → q ile yeniden encode boyut orani (emprik lineer fit).
const recompressFactor = (q: number): number => 4.6 * q - 3.275;

const chooseQuality = (oversizeRatio: number): number => {
  const t = Math.min(1, Math.max(0, Math.log2(Math.max(1, oversizeRatio)) / 3.0));
  return MAX_QUALITY - (MAX_QUALITY - MIN_QUALITY) * t;
};

// Album picker'in dondurdugu URI'lar bazen `?ext=heic` parametresi tasiyor.
const isJpegUri = (uri: string): boolean => {
  const cleaned = uri.split(/[?#]/)[0]?.toLowerCase() ?? "";
  return cleaned.endsWith(".jpg") || cleaned.endsWith(".jpeg");
};

const CACHE_LONG_EDGE = 1280;
const CACHE_QUALITY = 0.78;

// Yerel disk kopyasi icin display-quality versiyon (kart + detay icin yeterli).
export async function compressForLocalCache(imageUri: string): Promise<string> {
  let probeWidth = 0;
  let probeHeight = 0;
  try {
    const probe = await ImageManipulator.manipulate(imageUri).renderAsync();
    probeWidth = probe.width;
    probeHeight = probe.height;
  } catch (err) {
    console.log("[CACHE] compress probe failed:", String(err));
    return imageUri;
  }
  if (probeWidth <= 0 || probeHeight <= 0) return imageUri;

  const isLandscape = probeWidth >= probeHeight;
  const longEdge = Math.max(probeWidth, probeHeight);
  const targetEdge = Math.min(longEdge, CACHE_LONG_EDGE);
  const needsResize = targetEdge < longEdge;
  const resizeOpt = isLandscape ? { width: targetEdge } : { height: targetEdge };

  try {
    const pipe = ImageManipulator.manipulate(imageUri);
    const ref = await (needsResize ? pipe.resize(resizeOpt) : pipe).renderAsync();
    const out = await ref.saveAsync({ compress: CACHE_QUALITY, format: SaveFormat.JPEG });
    return out.uri;
  } catch (err) {
    console.log("[CACHE] compress encode failed:", String(err));
    return imageUri;
  }
}

export async function prepareDiseaseImageForUpload(
  imageUri: string,
  _opts?: { width?: number; height?: number; exportSize?: number; quality?: number },
): Promise<string> {
  const isJpeg = isJpegUri(imageUri);

  let inputSize = 0;
  try {
    const file = new File(imageUri);
    if (file.exists) {
      inputSize = file.size ?? 0;
      if (isJpeg && inputSize > 0 && inputSize <= MAX_BYTES) return imageUri;
    }
  } catch {
    // size probe basarisiz — encode yoluna gec
  }

  let probeWidth = 0;
  let probeHeight = 0;
  try {
    const probe = await ImageManipulator.manipulate(imageUri).renderAsync();
    probeWidth = probe.width;
    probeHeight = probe.height;
  } catch (err) {
    console.log("[DISEASE] prepare probe failed:", String(err));
    return imageUri;
  }
  const originalLongEdge = Math.max(probeWidth, probeHeight);
  if (originalLongEdge <= 0) return imageUri;
  const isLandscape = probeWidth >= probeHeight;

  const knownInput = inputSize > 0 && inputSize <= MAX_BYTES;
  const onlyTranscode = !isJpeg && knownInput;

  let quality: number;
  let scale: number;
  if (onlyTranscode) {
    quality = MAX_QUALITY;
    scale = 1;
  } else {
    const safeInput = inputSize > 0 ? inputSize : MAX_BYTES * 2;
    const oversizeRatio = safeInput / TARGET_BYTES;
    quality = chooseQuality(oversizeRatio);
    const recomp = recompressFactor(quality);
    // out = in · s² · recomp  ⇒  s = sqrt(target / (in · recomp))
    scale = Math.sqrt(TARGET_BYTES / (safeInput * recomp));
    scale = Math.min(1, Math.max(MIN_LONG_EDGE / originalLongEdge, scale));
  }

  const targetLongEdge = Math.max(MIN_LONG_EDGE, Math.floor(originalLongEdge * scale));
  const needsResize = scale < 1;
  const resizeOpt = isLandscape ? { width: targetLongEdge } : { height: targetLongEdge };

  try {
    const pipe = ImageManipulator.manipulate(imageUri);
    const ref = await (needsResize ? pipe.resize(resizeOpt) : pipe).renderAsync();
    let out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    let outSize = new File(out.uri).size ?? 0;

    // Rescue: ayni ref'ten dusuk q ile yeniden kaydet (yeni decode/resize yok).
    if (outSize > MAX_BYTES) {
      const rescueQ = Math.max(MIN_QUALITY - 0.05, quality - 0.06);
      out = await ref.saveAsync({ compress: rescueQ, format: SaveFormat.JPEG });
      outSize = new File(out.uri).size ?? 0;
      console.log(
        `[DISEASE] prepare rescue: q=${quality.toFixed(2)} → ${rescueQ.toFixed(2)}, ${(outSize / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    const mode = onlyTranscode ? "transcode" : needsResize ? "resize" : "encode";
    const inputSizeMB = inputSize > 0 ? (inputSize / 1024 / 1024).toFixed(2) : "?";
    console.log(
      `[DISEASE] prepare ${mode}: ${inputSizeMB}MB → ${(outSize / 1024 / 1024).toFixed(2)}MB ` +
        `(${originalLongEdge}px → ${targetLongEdge}px, q=${quality.toFixed(2)}, jpeg=${isJpeg})`,
    );
    return out.uri;
  } catch (err) {
    console.log("[DISEASE] prepare encode failed:", String(err));
    return imageUri;
  }
}
