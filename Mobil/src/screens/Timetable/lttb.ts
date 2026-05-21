// Largest-Triangle-Three-Buckets downsampling
// Sweetspot: 100k ham noktayi 500-1000 noktaya indirir, gorsel detayi korur
// Sven Steinarsson, "Downsampling Time Series for Visual Representation" (2013)

export interface LttbPoint {
  ts: number; // unix ms
  value: number;
}

/**
 * Downsample a time series using LTTB.
 * - First and last points always preserved.
 * - Empty / single / sub-threshold inputs returned as-is.
 * - O(n) — single pass.
 *
 * @param data Sorted-by-ts points
 * @param threshold Target output size
 */
export function lttbDownsample<T extends LttbPoint>(
  data: T[],
  threshold: number,
): T[] {
  const n = data.length;
  if (threshold <= 2 || n <= threshold) return data;

  const sampled: T[] = new Array(threshold);
  const bucketSize = (n - 2) / (threshold - 2);

  // Ilk nokta her zaman korunur
  let a = 0;
  sampled[0] = data[a]!;

  for (let i = 0; i < threshold - 2; i++) {
    // Bir sonraki bucket'in ortalama noktasini hesapla (rangeC)
    const rangeCStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeCEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    const rangeCLen = rangeCEnd - rangeCStart;
    let avgTs = 0;
    let avgVal = 0;
    for (let j = rangeCStart; j < rangeCEnd; j++) {
      avgTs += data[j]!.ts;
      avgVal += data[j]!.value;
    }
    avgTs /= rangeCLen;
    avgVal /= rangeCLen;

    // Aktif bucket icin en buyuk ucgen alanini bulan noktayi sec (rangeB)
    const rangeBStart = Math.floor(i * bucketSize) + 1;
    const rangeBEnd = Math.floor((i + 1) * bucketSize) + 1;
    const pointA = data[a]!;
    const pointATs = pointA.ts;
    const pointAVal = pointA.value;
    let maxArea = -1;
    let maxAreaIdx = rangeBStart;

    for (let j = rangeBStart; j < rangeBEnd; j++) {
      const p = data[j]!;
      // Ucgen alani (sabit faktor cikartilmis, sadece kiyaslama icin)
      const area = Math.abs(
        (pointATs - avgTs) * (p.value - pointAVal) -
          (pointATs - p.ts) * (avgVal - pointAVal),
      );
      if (area > maxArea) {
        maxArea = area;
        maxAreaIdx = j;
      }
    }

    sampled[i + 1] = data[maxAreaIdx]!;
    a = maxAreaIdx;
  }

  // Son noktayi koru
  sampled[threshold - 1] = data[n - 1]!;
  return sampled;
}
