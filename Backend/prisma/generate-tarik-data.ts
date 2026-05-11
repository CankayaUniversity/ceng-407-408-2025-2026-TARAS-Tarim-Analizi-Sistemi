/**
 * Modular data generator for tarik_tohum's sensor readings.
 *
 * Usage:
 *   npm run generate:tarik -- --replace --from 2026-01-01 --to 2026-03-31
 *   npm run generate:tarik -- --append --to 2026-06-30
 *   npm run generate:tarik -- --append            # from last reading to today
 *
 * Modes:
 *   --replace   Delete all existing tarik data, regenerate from scratch (default)
 *   --append    Keep existing data, continue from last reading
 *
 * Options:
 *   --from YYYY-MM-DD   Start date (replace default: 2026-01-01, append: auto)
 *   --to   YYYY-MM-DD   End date (default: today)
 */
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false"
    ? undefined
    : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ==================== CLI ARGS ====================

function parseArgs(): { mode: "replace" | "append"; from?: string; to?: string } {
  const args = process.argv.slice(2);
  let mode: "replace" | "append" = "replace";
  let from: string | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--append") mode = "append";
    else if (arg === "--replace") mode = "replace";
    else if (arg === "--from" && args[i + 1]) { from = args[++i]; }
    else if (arg === "--to" && args[i + 1]) { to = args[++i]; }
  }

  return { mode, from, to };
}

// ==================== CONSTANTS ====================

const TARIK_ZONE_IDS = [
  "d0000000-0000-0000-0000-000000000005",
  "d0000000-0000-0000-0000-000000000006",
  "d0000000-0000-0000-0000-000000000007",
];

const TARIK_SENSOR_IDS = [
  "e0000000-0000-0000-0000-000000000017",
  "e0000000-0000-0000-0000-000000000018",
  "e0000000-0000-0000-0000-000000000019",
  "e0000000-0000-0000-0000-00000000001A",
  "e0000000-0000-0000-0000-00000000001B",
  "e0000000-0000-0000-0000-00000000001C",
  "e0000000-0000-0000-0000-00000000001D",
  "e0000000-0000-0000-0000-00000000001E",
  "e0000000-0000-0000-0000-00000000001F",
];

const TICK = 15; // minutes
const BATCH = 1000;

// ==================== INTERFACES ====================

interface ZoneProfile {
  id: string;
  name: string;
  soil: string;
  fieldCapacity: number;
  dryRate: number;
  drainRate: number;
  rainAbsorb: number;
  irrigBoost: number;
  irrigThresh: number;
  greenhouse: boolean;
  ghTempBoost: number;
  ghHumBoost: number;
}

interface Sensor {
  id: string;
  zone: string;
  name: string;
  smOff: number;
  dryMult: number;
  tOff: number;
  hOff: number;
  irrigDelay: number;
  noise: number;
  battV: number;
  battDrain: number;
  calDry: number;
  calWet: number;
  fault?: { from: number; to: number; kind: string };
}

interface MonthWx {
  avgT: number;
  rangeT: number;
  avgH: number;
  rangeH: number;
  rain: number[];
  heavyRain: number[];
  cold: [number, number][];
  warm: [number, number][];
  wind: number;
  daylight: number;
}

interface Reading {
  node_id: string;
  created_at: Date;
  sm_percent: number;
  raw_sm_value: number;
  cal_dry_value: number;
  cal_wet_value: number;
  temperature: number;
  raw_temperature: number;
  humidity: number;
  raw_humidity: number;
  et0_instant: number;
  battery_voltage: number;
}

interface IrrigEvent {
  sensorId: string;
  zoneId: string;
  triggerTime: Date;
  resultTime: Date;
  triggerSm: number;
  resultSm: number;
  duration: number;
  volume: number;
}

// ==================== WEATHER PROFILES (Izmir, all 12 months) ====================

const WX: Record<number, MonthWx> = {
  1: {
    avgT: 9, rangeT: 18, avgH: 79, rangeH: 55,
    rain: [3, 4, 5, 10, 11, 12, 18, 19, 25, 26, 27],
    heavyRain: [4, 11, 26],
    cold: [[1, 3], [7, 9], [21, 23]],
    warm: [[13, 16], [28, 31]],
    wind: 12, daylight: 9.5,
  },
  2: {
    avgT: 10, rangeT: 19, avgH: 74, rangeH: 50,
    rain: [2, 3, 8, 9, 10, 16, 17, 22, 23],
    heavyRain: [9, 22],
    cold: [[5, 7], [18, 20]],
    warm: [[11, 14], [25, 28]],
    wind: 14, daylight: 10.5,
  },
  3: {
    avgT: 13, rangeT: 20, avgH: 68, rangeH: 48,
    rain: [1, 2, 7, 8, 14, 15, 24, 25],
    heavyRain: [7, 24],
    cold: [[3, 5]],
    warm: [[9, 13], [18, 22], [27, 31]],
    wind: 16, daylight: 12.0,
  },
  4: {
    avgT: 17, rangeT: 22, avgH: 62, rangeH: 45,
    rain: [3, 4, 11, 12, 20, 21],
    heavyRain: [11],
    cold: [],
    warm: [[7, 10], [22, 26]],
    wind: 14, daylight: 13.0,
  },
  5: {
    avgT: 22, rangeT: 24, avgH: 55, rangeH: 40,
    rain: [5, 6, 15, 16],
    heavyRain: [15],
    cold: [],
    warm: [[10, 15], [25, 31]],
    wind: 12, daylight: 14.5,
  },
  6: {
    avgT: 27, rangeT: 22, avgH: 45, rangeH: 35,
    rain: [8, 22],
    heavyRain: [],
    cold: [],
    warm: [[1, 10], [15, 25]],
    wind: 14, daylight: 15.0,
  },
  7: {
    avgT: 29, rangeT: 20, avgH: 40, rangeH: 30,
    rain: [],
    heavyRain: [],
    cold: [],
    warm: [[1, 31]],
    wind: 16, daylight: 14.5,
  },
  8: {
    avgT: 28, rangeT: 20, avgH: 42, rangeH: 32,
    rain: [18],
    heavyRain: [],
    cold: [],
    warm: [[1, 31]],
    wind: 14, daylight: 13.5,
  },
  9: {
    avgT: 24, rangeT: 22, avgH: 50, rangeH: 38,
    rain: [7, 8, 21, 22],
    heavyRain: [21],
    cold: [],
    warm: [[1, 10], [15, 20]],
    wind: 12, daylight: 12.5,
  },
  10: {
    avgT: 19, rangeT: 22, avgH: 60, rangeH: 42,
    rain: [3, 4, 12, 13, 24, 25, 26],
    heavyRain: [12, 25],
    cold: [[28, 31]],
    warm: [[5, 9]],
    wind: 10, daylight: 11.5,
  },
  11: {
    avgT: 14, rangeT: 20, avgH: 70, rangeH: 48,
    rain: [2, 3, 9, 10, 11, 18, 19, 25, 26],
    heavyRain: [10, 25],
    cold: [[20, 24]],
    warm: [[5, 8]],
    wind: 10, daylight: 10.0,
  },
  12: {
    avgT: 10, rangeT: 18, avgH: 77, rangeH: 52,
    rain: [1, 2, 7, 8, 9, 15, 16, 22, 23, 28, 29],
    heavyRain: [8, 22, 28],
    cold: [[10, 14], [25, 31]],
    warm: [[3, 6]],
    wind: 12, daylight: 9.5,
  },
};

// Pre-generate rain timing with seeded PRNG
function buildRainSchedule(): Map<string, { start: number; hrs: number; int: number }> {
  const m = new Map<string, { start: number; hrs: number; int: number }>();
  let s = 42;
  const r = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (const [mo, w] of Object.entries(WX)) {
    for (const d of w.rain) {
      const heavy = w.heavyRain.includes(d);
      m.set(`${mo}-${d}`, {
        start: Math.floor(r() * 8) + 4,
        hrs: heavy ? 8 + Math.floor(r() * 6) : 4 + Math.floor(r() * 5),
        int: heavy ? 0.6 + r() * 0.4 : 0.2 + r() * 0.3,
      });
    }
  }
  return m;
}

// ==================== ZONE PROFILES ====================

const ZONES: ZoneProfile[] = [
  {
    id: "d0000000-0000-0000-0000-000000000005",
    name: "Domates Serasi (Greenhouse, Loamy)",
    soil: "loamy",
    fieldCapacity: 72, dryRate: 0.45, drainRate: 2.5,
    rainAbsorb: 0.0, irrigBoost: 30, irrigThresh: 38,
    greenhouse: true, ghTempBoost: 8, ghHumBoost: 10,
  },
  {
    id: "d0000000-0000-0000-0000-000000000006",
    name: "Biber Bahcesi (Outdoor, Clay)",
    soil: "clay",
    fieldCapacity: 78, dryRate: 0.28, drainRate: 0.8,
    rainAbsorb: 0.85, irrigBoost: 22, irrigThresh: 35,
    greenhouse: false, ghTempBoost: 0, ghHumBoost: 0,
  },
  {
    id: "d0000000-0000-0000-0000-000000000007",
    name: "Patates Tarlasi (Outdoor, Sandy)",
    soil: "sandy",
    fieldCapacity: 55, dryRate: 0.85, drainRate: 8.0,
    rainAbsorb: 0.50, irrigBoost: 25, irrigThresh: 28,
    greenhouse: false, ghTempBoost: 0, ghHumBoost: 0,
  },
];

// ==================== SENSOR CONFIGS ====================

const SENSORS: Sensor[] = [
  // Zone 5 - Greenhouse (loamy)
  {
    id: "e0000000-0000-0000-0000-000000000017",
    zone: "d0000000-0000-0000-0000-000000000005",
    name: "Sera Merkez (Stable)",
    smOff: 3, dryMult: 1.0, tOff: 1, hOff: 2,
    irrigDelay: 0, noise: 0.8,
    battV: 4.15, battDrain: 0.003, calDry: 790, calWet: 210,
  },
  {
    id: "e0000000-0000-0000-0000-000000000018",
    zone: "d0000000-0000-0000-0000-000000000005",
    name: "Sera Kuzey (Ventilation side)",
    smOff: -2, dryMult: 1.08, tOff: -1, hOff: -3,
    irrigDelay: 10, noise: 1.0,
    battV: 4.10, battDrain: 0.003, calDry: 805, calWet: 195,
    fault: { from: 45, to: 47, kind: "noisy" },
  },
  {
    id: "e0000000-0000-0000-0000-000000000019",
    zone: "d0000000-0000-0000-0000-000000000005",
    name: "Sera Kenar (Weather edge)",
    smOff: -5, dryMult: 1.12, tOff: -3, hOff: -5,
    irrigDelay: 15, noise: 1.2,
    battV: 4.05, battDrain: 0.0035, calDry: 780, calWet: 225,
  },
  // Zone 6 - Pepper Garden (clay)
  {
    id: "e0000000-0000-0000-0000-00000000001A",
    zone: "d0000000-0000-0000-0000-000000000006",
    name: "Gunesli Bolge (Fast evaporation)",
    smOff: -8, dryMult: 1.20, tOff: 2, hOff: -5,
    irrigDelay: 5, noise: 1.1,
    battV: 4.20, battDrain: 0.0025, calDry: 810, calWet: 200,
  },
  {
    id: "e0000000-0000-0000-0000-00000000001B",
    zone: "d0000000-0000-0000-0000-000000000006",
    name: "Golgeli Alan (Moisture retaining)",
    smOff: 7, dryMult: 0.80, tOff: -2, hOff: 5,
    irrigDelay: 10, noise: 0.9,
    battV: 4.00, battDrain: 0.003, calDry: 775, calWet: 230,
  },
  {
    id: "e0000000-0000-0000-0000-00000000001C",
    zone: "d0000000-0000-0000-0000-000000000006",
    name: "Dusuk Drenaj (Waterlog prone)",
    smOff: 2, dryMult: 0.95, tOff: 0, hOff: 3,
    irrigDelay: 15, noise: 1.0,
    battV: 4.10, battDrain: 0.0028, calDry: 795, calWet: 215,
  },
  // Zone 7 - Potato Field (sandy)
  {
    id: "e0000000-0000-0000-0000-00000000001D",
    zone: "d0000000-0000-0000-0000-000000000007",
    name: "Kumlu Merkez (Standard sandy)",
    smOff: -3, dryMult: 1.0, tOff: 0, hOff: -2,
    irrigDelay: 5, noise: 1.0,
    battV: 4.05, battDrain: 0.003, calDry: 800, calWet: 205,
  },
  {
    id: "e0000000-0000-0000-0000-00000000001E",
    zone: "d0000000-0000-0000-0000-000000000007",
    name: "Sulama Hatti Yakin (Near line)",
    smOff: 8, dryMult: 0.90, tOff: 0, hOff: 0,
    irrigDelay: 0, noise: 0.8,
    battV: 4.15, battDrain: 0.0025, calDry: 785, calWet: 220,
  },
  {
    id: "e0000000-0000-0000-0000-00000000001F",
    zone: "d0000000-0000-0000-0000-000000000007",
    name: "Sulama Uzak (Drought prone)",
    smOff: -10, dryMult: 1.10, tOff: 1, hOff: -5,
    irrigDelay: 25, noise: 1.3,
    battV: 3.95, battDrain: 0.005, calDry: 815, calWet: 190,
    fault: { from: 72, to: 74, kind: "drift" },
  },
];

// ==================== HELPERS ====================

function gauss(stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return stddev * Math.sqrt(-2 * Math.log(Math.max(1e-10, u1))) * Math.cos(2 * Math.PI * u2);
}

function dayOfYear(d: Date): number {
  const jan0 = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - jan0) / 86400000);
}

function seasonMult(doy: number): number {
  // Sinusoidal year-round: ~0.5 in Jan, ~1.5 in Jul
  return 1.0 + 0.5 * Math.sin(((doy - 80) * 2 * Math.PI) / 365);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r3(v: number): number { return Math.round(v * 1000) / 1000; }

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ==================== WEATHER ENGINE ====================

function getWeather(
  ts: Date,
  rainSched: Map<string, { start: number; hrs: number; int: number }>,
): { t: number; h: number; raining: boolean; rInt: number; w: number } {
  const mo = ts.getUTCMonth() + 1;
  const dom = ts.getUTCDate();
  const hr = ts.getUTCHours() + ts.getUTCMinutes() / 60;
  const wx = WX[mo];
  if (!wx) throw new Error(`No weather for month ${mo}`);

  const angle = ((hr - 6) / 24) * 2 * Math.PI;
  let tCycle = Math.sin(angle) * (wx.rangeT / 2);
  if (wx.cold.some(([a, b]) => dom >= a && dom <= b)) tCycle -= 7;
  if (wx.warm.some(([a, b]) => dom >= a && dom <= b)) tCycle += 5;
  const temp = wx.avgT + tCycle + gauss(1.0);

  let hCycle = -Math.sin(angle) * (wx.rangeH / 3);
  const rk = `${mo}-${dom}`;
  const re = rainSched.get(rk);
  let raining = false;
  let rInt = 0;
  if (re) {
    if (hr >= re.start && hr <= re.start + re.hrs) {
      raining = true;
      rInt = re.int;
      hCycle += 20 * re.int;
    } else if (hr > re.start + re.hrs && hr <= re.start + re.hrs + 4) {
      hCycle += 10 * re.int;
    }
  }

  const hum = clamp(wx.avgH + hCycle + gauss(3), 25, 100);
  const wind = Math.max(0, wx.wind + gauss(3));
  return { t: temp, h: hum, raining, rInt, w: wind };
}

// ==================== ET0 ====================

function calcET0(
  temp: number, hum: number, wind: number,
  doy: number, daylight: number, hour: number,
): number {
  const Ra = (daylight / 12) * (15 + 5 * Math.sin(((doy - 80) * 2 * Math.PI) / 365));
  const tF = Math.max(0, temp + 17.8);
  const hF = Math.max(0.2, (100 - hum) / 100);
  const wF = 1 + (wind - 10) * 0.02;
  let et0 = 0.0023 * Ra * tF * hF * wF * Math.sqrt(Math.max(1, temp + 10));
  if (hour >= 6 && hour <= 20) {
    et0 *= Math.max(0, Math.sin((Math.PI * (hour - 6)) / 14));
  } else {
    et0 = 0.02;
  }
  return clamp(et0 + gauss(0.1), 0, 10);
}

function irrigCurve(elapsed: number, total: number): number {
  const t = clamp(elapsed / total, 0, 1);
  return t * t * (3 - 2 * t);
}

// ==================== ZONE SIMULATION ====================

interface SimConfig {
  startDate: Date;
  endDate: Date;
  initialMoisture: number[];  // per-sensor starting moisture (or empty for defaults)
  batteryDayOffset: number;   // days already elapsed for battery calc
}

function simulateZone(
  zone: ZoneProfile,
  sensors: Sensor[],
  rainSched: Map<string, { start: number; hrs: number; int: number }>,
  cfg: SimConfig,
): { readings: Reading[][]; events: IrrigEvent[] } {
  const readings: Reading[][] = sensors.map(() => []);
  const events: IrrigEvent[] = [];

  // Per-sensor moisture state
  const sm: number[] = cfg.initialMoisture.length === sensors.length
    ? [...cfg.initialMoisture]
    : sensors.map((s) => zone.fieldCapacity + s.smOff);

  // Zone-level irrigation state
  let irrigPending = false;
  let irrigStartTime: Date | null = null;
  let irrigActive = false;
  let irrigTriggerTime: Date | null = null;
  let irrigTriggerSm = 0;
  let irrigTriggerIdx = 0;
  const IRRIG_DUR = 90;

  const cur = new Date(cfg.startDate);
  const t0 = cfg.startDate.getTime();

  while (cur <= cfg.endDate) {
    const h = cur.getUTCHours();
    const d = dayOfYear(cur);
    const daysSince = cfg.batteryDayOffset + (cur.getTime() - t0) / 86400000;
    const mo = cur.getUTCMonth() + 1;
    const mw = WX[mo];
    if (!mw) throw new Error(`No weather for month ${mo}`);
    const sMul = seasonMult(d);

    const wx = getWeather(cur, rainSched);

    for (let i = 0; i < sensors.length; i++) {
      const s = sensors[i]!;
      let moisture = sm[i]!;

      let sT = wx.t;
      if (zone.greenhouse) {
        sT = clamp(wx.t + zone.ghTempBoost, 8, 32);
      }
      sT += s.tOff + gauss(0.5);

      let sH = wx.h + (zone.greenhouse ? zone.ghHumBoost : 0)
        + s.hOff + gauss(2);
      sH = clamp(sH, 20, 100);

      const et0 = calcET0(sT, sH, wx.w, d, mw.daylight, h);

      const moistFactor = clamp(moisture / 70, 0.25, 1.2);
      const tFact = 1 + (sT - 10) * 0.025;
      const hFact = 1 + (60 - sH) * 0.008;
      const rate = zone.dryRate * s.dryMult * tFact * hFact * sMul * moistFactor;
      moisture -= rate * (TICK / 60);

      const sFC = zone.fieldCapacity + s.smOff;
      if (moisture > sFC) {
        moisture -= Math.min(moisture - sFC, zone.drainRate * (TICK / 60));
      }

      if (wx.raining && !zone.greenhouse) {
        moisture += wx.rInt * zone.rainAbsorb * 2.0 * (TICK / 60);
      }

      if (irrigActive && irrigStartTime) {
        const sIrrigStart = irrigStartTime.getTime() + s.irrigDelay * 60000;
        const elapsed = (cur.getTime() - sIrrigStart) / 60000;
        if (elapsed >= 0 && elapsed <= IRRIG_DUR) {
          const prev = irrigCurve(elapsed - TICK, IRRIG_DUR);
          const now = irrigCurve(elapsed, IRRIG_DUR);
          moisture += (now - prev) * (zone.irrigBoost + s.smOff * 0.2);
        }
      }

      if (s.fault && d >= s.fault.from && d <= s.fault.to) {
        if (s.fault.kind === "noisy") moisture += gauss(8);
        else if (s.fault.kind === "drift") moisture = 18 + gauss(2);
      }

      const cycle = Math.sin(((h - 14) * Math.PI) / 12) * 1.5;
      const noise = gauss(1.2 * s.noise);
      const finalSm = clamp(moisture + cycle + noise, 12, 98);
      moisture = clamp(moisture, 12, 98);
      sm[i] = moisture;

      const rawSm = Math.round(
        s.calDry - ((s.calDry - s.calWet) * (finalSm / 100))
        + (Math.random() - 0.5) * 30,
      );
      const batt = s.battV - daysSince * s.battDrain + gauss(0.015);

      readings[i]!.push({
        node_id: s.id,
        created_at: new Date(cur),
        sm_percent: r2(finalSm),
        raw_sm_value: clamp(Math.round(rawSm), 100, 900),
        cal_dry_value: s.calDry,
        cal_wet_value: s.calWet,
        temperature: r2(sT),
        raw_temperature: r2(sT + gauss(0.3)),
        humidity: r2(sH),
        raw_humidity: r2(clamp(sH + gauss(0.5), 20, 100)),
        et0_instant: r3(et0),
        battery_voltage: r3(Math.max(3.0, batt)),
      });
    }

    if (!irrigPending && !irrigActive) {
      const avg = sm.reduce((a, b) => a + b, 0) / sm.length;
      const anyCritical = sm.some((m) => m <= zone.irrigThresh - 5);
      if (avg <= zone.irrigThresh || anyCritical) {
        irrigPending = true;
        irrigTriggerTime = new Date(cur);
        let minIdx = 0;
        for (let j = 1; j < sm.length; j++) {
          if (sm[j]! < sm[minIdx]!) minIdx = j;
        }
        irrigTriggerSm = sm[minIdx]!;
        irrigTriggerIdx = minIdx;
        const sDate = new Date(cur);
        if (h < 4 || h >= 8) {
          if (h >= 8) sDate.setUTCDate(sDate.getUTCDate() + 1);
          sDate.setUTCHours(6, 0, 0, 0);
        }
        irrigStartTime = sDate;
      }
    }

    if (irrigPending && irrigStartTime && cur >= irrigStartTime) {
      irrigPending = false;
      irrigActive = true;
    }

    if (irrigActive && irrigStartTime) {
      const maxDelay = Math.max(...sensors.map((s) => s.irrigDelay));
      const totalEnd = irrigStartTime.getTime() + (IRRIG_DUR + maxDelay) * 60000;
      if (cur.getTime() > totalEnd) {
        const resultTime = new Date(
          irrigStartTime.getTime() + (IRRIG_DUR + 30) * 60000,
        );
        events.push({
          sensorId: sensors[irrigTriggerIdx]!.id,
          zoneId: zone.id,
          triggerTime: irrigTriggerTime!,
          resultTime,
          triggerSm: irrigTriggerSm,
          resultSm: sm[irrigTriggerIdx]!,
          duration: IRRIG_DUR,
          volume: Math.round(400 + Math.random() * 300),
        });
        irrigActive = false;
        irrigStartTime = null;
        irrigTriggerTime = null;
      }
    }

    cur.setUTCMinutes(cur.getUTCMinutes() + TICK);
  }

  return { readings, events };
}

// ==================== DB HELPERS ====================

async function deleteExistingData(): Promise<void> {
  console.log("Deleting existing data...");
  const dj = await prisma.irrigationJob.deleteMany({
    where: { zone_id: { in: TARIK_ZONE_IDS } },
  });
  console.log(`  ${dj.count} irrigation jobs`);

  const dk = await prisma.kcCalibrationHistory.deleteMany({
    where: { zone_id: { in: TARIK_ZONE_IDS } },
  });
  console.log(`  ${dk.count} KC calibration records`);

  const dr = await prisma.sensorReading.deleteMany({
    where: { node_id: { in: TARIK_SENSOR_IDS } },
  });
  console.log(`  ${dr.count} sensor readings`);
}

async function getLastReadings(): Promise<Map<string, { time: Date; sm: number; battDays: number }>> {
  const result = new Map<string, { time: Date; sm: number; battDays: number }>();
  const refDate = new Date("2026-01-01T00:00:00Z");

  for (const sensorId of TARIK_SENSOR_IDS) {
    const last = await prisma.sensorReading.findFirst({
      where: { node_id: sensorId },
      orderBy: { created_at: "desc" },
      select: { created_at: true, sm_percent: true },
    });
    if (last?.created_at && last.sm_percent != null) {
      const daysSinceRef = (last.created_at.getTime() - refDate.getTime()) / 86400000;
      result.set(sensorId, {
        time: last.created_at,
        sm: last.sm_percent,
        battDays: daysSinceRef,
      });
    }
  }
  return result;
}

async function insertReadings(
  zoneSensors: Sensor[],
  readings: Reading[][],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < zoneSensors.length; i++) {
    const sReadings = readings[i]!;
    for (let j = 0; j < sReadings.length; j += BATCH) {
      await prisma.sensorReading.createMany({
        data: sReadings.slice(j, j + BATCH),
      });
    }
    console.log(`    ${zoneSensors[i]!.name}: ${sReadings.length} readings`);
    total += sReadings.length;
  }
  return total;
}

async function createIrrigationJobs(allEvents: IrrigEvent[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < allEvents.length; i++) {
    const ev = allEvents[i]!;
    const triggerReading = await prisma.sensorReading.findFirst({
      where: { node_id: ev.sensorId, created_at: ev.triggerTime },
    });
    if (!triggerReading) continue;

    const resultReading = await prisma.sensorReading.findFirst({
      where: { node_id: ev.sensorId, created_at: { gte: ev.resultTime } },
      orderBy: { created_at: "asc" },
    });

    const status = i % 3 === 0 ? "ANALYZED" : "EXECUTED";
    const gain = status === "ANALYZED"
      ? r3((ev.resultSm - ev.triggerSm) * 0.01)
      : null;
    const thresh = ZONES.find((z) => z.id === ev.zoneId)?.irrigThresh ?? 30;

    await prisma.irrigationJob.create({
      data: {
        zone_id: ev.zoneId,
        trigger_reading_id: triggerReading.id,
        result_reading_id: resultReading?.id ?? null,
        reasoning: `Toprak nemi kritik seviyeye dustu `
          + `(${ev.triggerSm.toFixed(1)}% < ${thresh}% esik). Sulama baslatildi.`,
        recommended_duration_min: ev.duration,
        recommended_volume_liters: ev.volume,
        status,
        actual_start_time: new Date(ev.triggerTime.getTime() + 30 * 60000),
        actual_duration_min: ev.duration,
        calculated_gain_outcome: gain,
      },
    });
    count++;
  }
  return count;
}

async function printSummary(): Promise<void> {
  console.log("\n=== SUMMARY ===");
  for (const zone of ZONES) {
    const sIds = SENSORS.filter((s) => s.zone === zone.id).map((s) => s.id);
    const stats = await prisma.sensorReading.aggregate({
      where: { node_id: { in: sIds } },
      _avg: { sm_percent: true, temperature: true },
      _min: { sm_percent: true, created_at: true },
      _max: { sm_percent: true, created_at: true },
      _count: true,
    });
    const jobs = await prisma.irrigationJob.count({
      where: { zone_id: zone.id },
    });
    const from = stats._min.created_at ? toDateStr(stats._min.created_at) : "?";
    const to = stats._max.created_at ? toDateStr(stats._max.created_at) : "?";
    console.log(`\n${zone.name}:`);
    console.log(`  Readings: ${stats._count} (${from} -> ${to})`);
    console.log(`  SM%: avg=${stats._avg.sm_percent?.toFixed(1)}`
      + `, min=${stats._min.sm_percent?.toFixed(1)}`
      + `, max=${stats._max.sm_percent?.toFixed(1)}`);
    console.log(`  Temp avg: ${stats._avg.temperature?.toFixed(1)} C`);
    console.log(`  Irrigation jobs: ${jobs}`);
  }
}

// ==================== MAIN ====================

async function main(): Promise<void> {
  const cli = parseArgs();
  const now = new Date();
  const todayStr = toDateStr(now);

  console.log("=== TARIK SENSOR DATA GENERATOR ===");
  console.log(`Mode: ${cli.mode}`);

  const rainSched = buildRainSchedule();
  const allEvents: IrrigEvent[] = [];
  let totalReadings = 0;

  if (cli.mode === "replace") {
    const from = new Date((cli.from ?? "2026-01-01") + "T00:00:00Z");
    const to = new Date((cli.to ?? todayStr) + "T23:45:00Z");
    console.log(`Range: ${toDateStr(from)} -> ${toDateStr(to)}\n`);

    await deleteExistingData();
    console.log("");

    const batteryOffset = 0;
    for (const zone of ZONES) {
      const zoneSensors = SENSORS.filter((s) => s.zone === zone.id);
      console.log(`  ${zone.name}:`);
      const { readings, events } = simulateZone(zone, zoneSensors, rainSched, {
        startDate: from,
        endDate: to,
        initialMoisture: [],
        batteryDayOffset: batteryOffset,
      });
      totalReadings += await insertReadings(zoneSensors, readings);
      allEvents.push(...events);
      console.log(`    Irrigation events: ${events.length}`);
    }
  } else {
    // Append mode
    const lastReadings = await getLastReadings();
    if (lastReadings.size === 0) {
      console.error("No existing readings found. Use --replace mode first.");
      process.exit(1);
    }

    // Find latest timestamp across all sensors
    let latestTime = new Date(0);
    for (const [, info] of lastReadings) {
      if (info.time > latestTime) latestTime = info.time;
    }
    const from = new Date(latestTime.getTime() + TICK * 60000);
    const to = new Date((cli.to ?? todayStr) + "T23:45:00Z");

    if (from >= to) {
      console.log(`Data already up to date (last: ${toDateStr(latestTime)}, target: ${toDateStr(to)})`);
      await printSummary();
      return;
    }
    console.log(`Appending: ${toDateStr(from)} -> ${toDateStr(to)}\n`);

    for (const zone of ZONES) {
      const zoneSensors = SENSORS.filter((s) => s.zone === zone.id);
      console.log(`  ${zone.name}:`);

      // Seed initial moisture from last readings
      const initMoisture: number[] = [];
      let battOffset = 0;
      for (const s of zoneSensors) {
        const last = lastReadings.get(s.id);
        initMoisture.push(last?.sm ?? (zone.fieldCapacity + s.smOff));
        if (last) battOffset = Math.max(battOffset, last.battDays);
      }

      const { readings, events } = simulateZone(zone, zoneSensors, rainSched, {
        startDate: from,
        endDate: to,
        initialMoisture: initMoisture,
        batteryDayOffset: battOffset,
      });
      totalReadings += await insertReadings(zoneSensors, readings);
      allEvents.push(...events);
      console.log(`    Irrigation events: ${events.length}`);
    }
  }

  console.log(`\n  Total: ${totalReadings} readings`);

  if (allEvents.length > 0) {
    console.log("\nCreating irrigation jobs...");
    const jobCount = await createIrrigationJobs(allEvents);
    console.log(`  Created ${jobCount} irrigation jobs`);
  }

  await printSummary();
  console.log("\nDone!");
}

main()
  .catch((e: unknown) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
