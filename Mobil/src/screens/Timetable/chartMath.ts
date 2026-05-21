// Timetable grafik kartinin saf yardimci fonksiyonlari (React/tema icermez, test edilebilir).

import type { ChartSeries } from "./types";
import { lttbDownsample } from "./lttb";

export const MAX_POINTS_PER_SERIES = 240;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const pad2 = (n: number): string => n.toString().padStart(2, "0");
export const formatTime = (d: Date): string =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const formatDay = (d: Date): string =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

// Gun-ici (24'u bolen) ve dakika (60'i bolen) bolen araliklar -> tick'ler temiz sinirlara oturur.
const NICE_TIME_INTERVALS = [
  1 * MIN_MS, 2 * MIN_MS, 5 * MIN_MS, 10 * MIN_MS, 15 * MIN_MS, 30 * MIN_MS,
  1 * HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS, 4 * HOUR_MS, 6 * HOUR_MS, 12 * HOUR_MS,
  1 * DAY_MS, 2 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS,
];

// span / hedef tick sayisina gore en kucuk uygun "guzel" interval.
export const pickTimeInterval = (spanMs: number, targetTicks: number): number => {
  const raw = spanMs / Math.max(1, targetTicks);
  return (
    NICE_TIME_INTERVALS.find((iv) => iv >= raw) ??
    NICE_TIME_INTERVALS[NICE_TIME_INTERVALS.length - 1]!
  );
};

// [tsMin, tsMax] icinde gece yarisindan baslayan interval katlarinda tick zaman damgalari uretir.
export const generateTimeTicks = (
  tsMin: number,
  tsMax: number,
  interval: number,
): number[] => {
  if (tsMax <= tsMin) return [tsMin];
  const dayStart = new Date(tsMin);
  dayStart.setHours(0, 0, 0, 0);
  let t = dayStart.getTime();
  while (t < tsMin) t += interval;
  const ticks: number[] = [];
  for (let guard = 0; t <= tsMax && guard < 300; guard++) {
    ticks.push(t);
    t += interval;
  }
  return ticks;
};

// Tick etiketi: gunluk+ -> tarih; gun-ici & cok gun -> tarih + saat (iki satir); gun-ici & tek gun -> saat.
export const tickFormatFor = (
  interval: number,
  spanMs: number,
): { fmt: (ts: number) => string; multiLine: boolean } => {
  if (interval >= DAY_MS) {
    return { fmt: (ts) => formatDay(new Date(ts)), multiLine: false };
  }
  if (spanMs > 24 * HOUR_MS) {
    return {
      fmt: (ts) => {
        const d = new Date(ts);
        return `${formatDay(d)}\n${formatTime(d)}`;
      },
      multiLine: true,
    };
  }
  return { fmt: (ts) => formatTime(new Date(ts)), multiLine: false };
};

// Hex rengi alpha'li rgba'ya cevirir (cizgilerin opaklik/highlight ayari icin).
export const withAlpha = (color: string, alpha: number): string => {
  if (color.startsWith("#") && (color.length === 7 || color.length === 9)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
};

// Veri min/max'ini yuvarlak (1/2/2.5/5/10 × 10^k) adimlara oturtur -> temiz, tekrarsiz Y etiketleri.
export const niceAxis = (
  dataMin: number,
  dataMax: number,
  targetTicks: number,
): { min: number; max: number; step: number; sections: number; decimals: number } => {
  let mn = dataMin;
  let mx = dataMax;
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const rawStep = (mx - mn) / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceStep =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const min = Math.floor(mn / niceStep) * niceStep;
  const max = Math.ceil(mx / niceStep) * niceStep;
  const sections = Math.max(1, Math.round((max - min) / niceStep));
  const decimals = niceStep >= 1 ? 0 : niceStep >= 0.1 ? 1 : 2;
  return { min, max, step: niceStep, sections, decimals };
};

export interface UnifiedSeriesData {
  unifiedTs: number[];
  perSeriesValues: (number | null)[][];
}

// Coklu seriyi ortak (sirali) timeline'a hizalar; ortak ts'te degeri olmayan seri o noktayi
// komsulardan lineer interpolate eder. Toplam nokta cok ise timeline'i da LTTB ile seyreltir.
export const unifyAndDownsample = (series: ChartSeries[]): UnifiedSeriesData => {
  const downsampled = series.map((s) => ({
    ...s,
    points: lttbDownsample(s.points, MAX_POINTS_PER_SERIES),
  }));

  const allTs = new Set<number>();
  for (const s of downsampled) for (const p of s.points) allTs.add(p.ts);
  let finalTs = Array.from(allTs).sort((a, b) => a - b);
  if (finalTs.length > MAX_POINTS_PER_SERIES) {
    finalTs = lttbDownsample(
      finalTs.map((ts) => ({ ts, value: 0 })),
      MAX_POINTS_PER_SERIES,
    ).map((p) => p.ts);
  }

  const perSeriesValues = downsampled.map((s) => {
    const byTs = new Map<number, number>();
    for (const p of s.points) byTs.set(p.ts, p.value);
    return finalTs.map((ts) => {
      const exact = byTs.get(ts);
      if (exact !== undefined) return exact;
      let prev: { ts: number; value: number } | null = null;
      let next: { ts: number; value: number } | null = null;
      for (const p of s.points) {
        if (p.ts <= ts) prev = p;
        else {
          next = p;
          break;
        }
      }
      if (prev && next) {
        return prev.value + (next.value - prev.value) * ((ts - prev.ts) / (next.ts - prev.ts));
      }
      return prev?.value ?? next?.value ?? null;
    });
  });

  return { unifiedTs: finalTs, perSeriesValues };
};
