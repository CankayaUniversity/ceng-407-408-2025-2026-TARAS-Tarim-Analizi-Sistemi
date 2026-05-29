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

// ── Anormal bosluk (gap) tespiti ───────────────────────────────────────────
// Sensor node veri gondermeyi birakinca grafikte iki uzak nokta arasinda yaniltici bir
// baglanti cizgisi olusuyordu. Cozum: bir seride ardisik iki nokta arasi sure, o serinin
// TIPIK araligindan cok daha buyukse cizgiyi kopar (interpolasyon/baglanti yok = bos birak).
// Esik VERIYE GORE ADAPTIF: median ardisik aralik × GAP_FACTOR. Boylece LTTB seyreltme +
// degisken zaman penceresi (6sa..1ay) otomatik telafi edilir — sabit bir sure kullanmiyoruz
// (sabit esik uzun pencerede normal veriyi koparirdi, kisa pencerede bosluklari kacirirdi).
const GAP_FACTOR = 3;
// Anlamli bir median icin gereken minimum ardisik-aralik sayisi (>= 4 nokta). Daha azsa seri
// gap-break'e uygun degil -> sonsuz esik (bugunku gibi her zaman baglanir).
const MIN_DELTAS_FOR_GAP = 3;

// Bir serinin (ts'e gore sirali) median ardisik araligi. Yetersiz nokta -> null (uygun degil).
// Median secildi (ortalama degil) cunku tek bir uzun kopukluk (outage) ortalamayi sisirir ama
// median'i etkilemez -> esik gercek cadence'a sadik kalir.
const medianConsecutiveDelta = (points: { ts: number }[]): number | null => {
  if (points.length < MIN_DELTAS_FOR_GAP + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i]!.ts - points[i - 1]!.ts;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length < MIN_DELTAS_FOR_GAP) return null;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  return deltas.length % 2 === 0 ? (deltas[mid - 1]! + deltas[mid]!) / 2 : deltas[mid]!;
};

// Coklu seriyi ortak (sirali) timeline'a hizalar; ortak ts'te degeri olmayan seri o noktayi
// komsulardan lineer interpolate eder. Toplam nokta cok ise timeline'i da LTTB ile seyreltir.
// Anormal bosluklarda (yukari bkz.) interpolasyon yerine null doner -> cizgi kopar.
export const unifyAndDownsample = (series: ChartSeries[]): UnifiedSeriesData => {
  const downsampled = series.map((s) => ({
    ...s,
    points: lttbDownsample(s.points, MAX_POINTS_PER_SERIES),
  }));

  // Her seri icin adaptif bosluk esigi (downsample SONRASI noktalardan — interpolasyonun test
  // ettigi araliklar bunlar). null/yetersiz -> Infinity (o seri asla kopmaz).
  const seriesCaps = downsampled.map((s) => {
    const med = medianConsecutiveDelta(s.points);
    return med == null ? Infinity : med * GAP_FACTOR;
  });

  const allTs = new Set<number>();
  for (const s of downsampled) for (const p of s.points) allTs.add(p.ts);
  let finalTs = Array.from(allTs).sort((a, b) => a - b);
  if (finalTs.length > MAX_POINTS_PER_SERIES) {
    finalTs = lttbDownsample(
      finalTs.map((ts) => ({ ts, value: 0 })),
      MAX_POINTS_PER_SERIES,
    ).map((p) => p.ts);
  }

  // Global sessizlik (tum node'lar AYNI ANDA susmus) icin: arada hicbir serinin noktasi olmadigindan
  // unified timeline'da buyuk bir sicrama olusur ve iki gercek nokta dogrudan baglanir (null slotu yok).
  // En dar serinin esigini (min cap) asan her sicramanin ortasina bir "kopma isareti" ts ekleriz; o
  // indexte her seri KENDI esigine gore null/interpolate eder -> dar seriler kopar, seyrekler degismeden
  // gecer. min cap kullanmak tam dogru: bir seri yalnizca ardisik iki finalTs arasinda kopmali ise
  // (= straddle == sicrama) kopar, ki bu durumda sicrama > o serinin cap'i >= min cap olur.
  const markerThreshold = Math.min(...seriesCaps);
  if (isFinite(markerThreshold) && finalTs.length > 1) {
    const withMarkers: number[] = [];
    for (let i = 0; i < finalTs.length; i++) {
      withMarkers.push(finalTs[i]!);
      const nextTs = finalTs[i + 1];
      if (nextTs !== undefined && nextTs - finalTs[i]! > markerThreshold) {
        withMarkers.push((finalTs[i]! + nextTs) / 2); // bosluk ortasi (hicbir gercek ts ile cakismaz)
      }
    }
    finalTs = withMarkers;
  }

  const perSeriesValues = downsampled.map((s, si) => {
    const cap = seriesCaps[si]!;
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
        // Iki gercek nokta cok uzaksa (anormal bosluk) baglama -> null (cizgi kopar).
        if (next.ts - prev.ts > cap) return null;
        return prev.value + (next.value - prev.value) * ((ts - prev.ts) / (next.ts - prev.ts));
      }
      // Seri ucu: tek komsuya uzaklik esigi asiyorsa duz uzatma yapma (orn. erken susan node).
      if (prev) return ts - prev.ts > cap ? null : prev.value;
      if (next) return next.ts - ts > cap ? null : next.value;
      return null;
    });
  });

  return { unifiedTs: finalTs, perSeriesValues };
};
