// Yaprak tespiti — SSD post-NMS cikti semasini bekler:
//   (detection_boxes, detection_scores, detection_classes, num_detections)
//
// Mevcut bundled tflite (mediapipe-model-maker default export) RAW SSD cikislari
// veriyor; mobile NMS+anchor decode pratikte mumkun degil. ML tarafi modeli
// MultilevelDetectionGenerator wrapper ile re-export edince (knowledge_ops.md §12)
// bu kod direkt calisir. O zamana kadar loadLeafDetectorModel sema dogrulama
// adiminda null doner; toggle JS tarafinda OFF'a duser, crash yok.

export const LEAF_INPUT_SIZE = 320;
export const LEAF_SCORE_THRESHOLD = 0.4;
export const LEAF_CROP_PADDING_RATIO = 0.10;

// Beklenen post-NMS cikti boyutlari
const EXPECTED_NUM_BOXES = 100;
const EXPECTED_BOX_COORDS = 4;

export interface LeafBox {
  /** [0,1] normalized over the input frame, [ymin, xmin, ymax, xmax] convention */
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  score: number;
}

export interface LeafDetectionResult {
  /** Model loaded + schema valid + run succeeded */
  available: boolean;
  /** Highest-confidence box above LEAF_SCORE_THRESHOLD, or null if none */
  topBox: LeafBox | null;
  /** Total boxes above threshold (info / debug) */
  numAboveThreshold: number;
}

/**
 * Validates leaf detector outputs against the expected post-NMS schema.
 * Returns false if the model is the current raw-SSD export (anchor deltas +
 * per-anchor logits). Used at model-load time to decide if the cascade can run.
 */
export function isPostNmsSchema(outputs: unknown[]): boolean {
  if (!outputs || outputs.length !== 4) return false;
  const boxes = outputs[0] as Float32Array | undefined;
  const scores = outputs[1] as Float32Array | undefined;
  if (!boxes || !scores) return false;
  if (boxes.length !== EXPECTED_NUM_BOXES * EXPECTED_BOX_COORDS) return false;
  if (scores.length !== EXPECTED_NUM_BOXES) return false;
  return true;
}

/**
 * Parse post-NMS outputs into a LeafDetectionResult.
 *
 * Outputs (mediapipe-model-maker post-NMS export, after re-wrap with NMS):
 *   outputs[0]: detection_boxes   Float32Array(400)  [ymin,xmin,ymax,xmax] x100, normalized
 *   outputs[1]: detection_scores  Float32Array(100)  per-box, descending
 *   outputs[2]: detection_classes Float32Array(100)  class indices (single class = leaf)
 *   outputs[3]: num_detections    Float32Array(1)    count above internal NMS threshold
 *
 * Worklet-safe: pure number ops, no allocations beyond the result object.
 */
export function parseLeafDetectorOutputs(outputs: unknown[]): LeafDetectionResult {
  "worklet";
  if (!isPostNmsSchema(outputs)) {
    return { available: false, topBox: null, numAboveThreshold: 0 };
  }
  const boxes = outputs[0] as Float32Array;
  const scores = outputs[1] as Float32Array;
  const numDet = Math.min((outputs[3] as Float32Array)[0] | 0, EXPECTED_NUM_BOXES);

  let topIdx = -1;
  let topScore = LEAF_SCORE_THRESHOLD;
  let aboveThr = 0;
  for (let i = 0; i < numDet; i++) {
    const s = scores[i];
    if (s > LEAF_SCORE_THRESHOLD) aboveThr++;
    if (s > topScore) {
      topScore = s;
      topIdx = i;
    }
  }

  if (topIdx < 0) {
    return { available: true, topBox: null, numAboveThreshold: 0 };
  }
  const o = topIdx * 4;
  return {
    available: true,
    topBox: {
      ymin: boxes[o],
      xmin: boxes[o + 1],
      ymax: boxes[o + 2],
      xmax: boxes[o + 3],
      score: topScore,
    },
    numAboveThreshold: aboveThr,
  };
}

export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a normalized leaf bbox into a SQUARE pixel crop with padding,
 * clamped to the frame bounds. Square because the disease classifier expects
 * 1:1 input (matches its training preprocessing center_crop=224).
 *
 * Worklet-safe.
 */
export function leafBoxToCropPx(
  box: LeafBox,
  frameWidth: number,
  frameHeight: number,
  paddingRatio: number = LEAF_CROP_PADDING_RATIO,
): CropPx {
  "worklet";
  const wNorm = box.xmax - box.xmin;
  const hNorm = box.ymax - box.ymin;
  const padX = wNorm * paddingRatio;
  const padY = hNorm * paddingRatio;

  const xminPx = Math.max(0, (box.xmin - padX) * frameWidth);
  const yminPx = Math.max(0, (box.ymin - padY) * frameHeight);
  const xmaxPx = Math.min(frameWidth, (box.xmax + padX) * frameWidth);
  const ymaxPx = Math.min(frameHeight, (box.ymax + padY) * frameHeight);

  // Square the crop around the bbox center, clamped to the frame
  const cw = xmaxPx - xminPx;
  const ch = ymaxPx - yminPx;
  const side = Math.max(cw, ch);
  const cx = (xminPx + xmaxPx) / 2;
  const cy = (yminPx + ymaxPx) / 2;
  let sxmin = cx - side / 2;
  let symin = cy - side / 2;
  if (sxmin < 0) sxmin = 0;
  if (symin < 0) symin = 0;
  if (sxmin + side > frameWidth) sxmin = frameWidth - side;
  if (symin + side > frameHeight) symin = frameHeight - side;
  // After re-anchoring, if the square is still bigger than the frame
  // (extreme case: bbox larger than frame's smaller dim), shrink to fit.
  let finalSide = side;
  if (sxmin < 0) {
    sxmin = 0;
    finalSide = Math.min(finalSide, frameWidth);
  }
  if (symin < 0) {
    symin = 0;
    finalSide = Math.min(finalSide, frameHeight);
  }
  return {
    x: Math.round(sxmin),
    y: Math.round(symin),
    width: Math.round(finalSide),
    height: Math.round(finalSide),
  };
}

/**
 * In-place [0,1] -> [-1,1] for the leaf detector input buffer.
 * Per manifest: SSD-MobileNetV2 expects (pixel_uint8 - 127.5) / 127.5.
 * vision-camera-resize-plugin's float32 dtype yields [0,1]; this is the
 * second normalization step.
 *
 * Worklet-safe.
 */
export function normalizeLeafInputInPlace(buf: Float32Array): void {
  "worklet";
  const len = buf.length;
  for (let i = 0; i < len; i++) {
    buf[i] = buf[i] * 2 - 1;
  }
}
