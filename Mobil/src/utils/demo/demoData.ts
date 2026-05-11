// Demo veri uretici — sahte tarla, sensor, disease, carbon ve sample image kayit defteri.

import type { FieldPolygon, SensorNode, FieldData } from "../fieldPlaceholder";
import type {
  FieldSummary,
  DashboardData,
  DiseaseDetection,
  Zone,
} from "../api";
import type { CarbonLog, ActivityType, CarbonSummary } from "../../screens/CarbonFootprint/types";
import { recommendationsFor } from "./demoStorage";

type PolygonGenerator = () => FieldPolygon;

const DEMO_SHAPES: PolygonGenerator[] = [
  () => ({
    exterior: [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ],
  }),
  () => ({
    exterior: [
      [0, 0],
      [80, 0],
      [80, 40],
      [50, 40],
      [50, 70],
      [0, 70],
    ],
  }),
  () => ({
    exterior: [
      [10, 5],
      [95, 0],
      [100, 55],
      [5, 65],
    ],
  }),
  () => ({
    exterior: [
      [50, 0],
      [100, 35],
      [80, 90],
      [20, 90],
      [0, 35],
    ],
  }),
  () => ({
    exterior: [
      [0, 0],
      [120, 0],
      [120, 80],
      [0, 80],
    ],
    holes: [
      [
        [70, 45],
        [100, 45],
        [100, 65],
        [70, 65],
      ],
    ],
  }),
  () => ({
    exterior: [
      [20, 0],
      [80, 0],
      [100, 60],
      [0, 60],
    ],
  }),
  () => ({
    exterior: [
      [30, 0],
      [70, 0],
      [100, 30],
      [100, 60],
      [70, 90],
      [30, 90],
      [0, 60],
      [0, 30],
    ],
  }),
  () => ({
    exterior: [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ],
  }),
  () => ({
    exterior: [
      [0, 0],
      [1000, 0],
      [1000, 600],
      [0, 600],
    ],
  }),
];

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function isPointInPolygon(
  x: number,
  z: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0],
      zi = polygon[i][1];
    const xj = polygon[j][0],
      zj = polygon[j][1];

    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInHoles(
  x: number,
  z: number,
  holes?: [number, number][][],
): boolean {
  if (!holes) return false;
  return holes.some((hole) => isPointInPolygon(x, z, hole));
}

function getPolygonBounds(polygon: [number, number][]) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function randomPointInPolygon(
  polygon: FieldPolygon,
  rng: () => number,
  padding: number = 5,
): { x: number; z: number } | null {
  const bounds = getPolygonBounds(polygon.exterior);
  const paddedBounds = {
    minX: bounds.minX + padding,
    maxX: bounds.maxX - padding,
    minZ: bounds.minZ + padding,
    maxZ: bounds.maxZ - padding,
  };

  for (let attempt = 0; attempt < 100; attempt++) {
    const x =
      paddedBounds.minX + rng() * (paddedBounds.maxX - paddedBounds.minX);
    const z =
      paddedBounds.minZ + rng() * (paddedBounds.maxZ - paddedBounds.minZ);

    if (
      isPointInPolygon(x, z, polygon.exterior) &&
      !isPointInHoles(x, z, polygon.holes)
    ) {
      return { x, z };
    }
  }

  return null;
}

export function generateDemoFieldData(
  seed?: number,
  shapeIndex?: number,
): FieldData {
  const rng = seededRandom(seed ?? Date.now());

  const selectedIndex = shapeIndex ?? Math.floor(rng() * DEMO_SHAPES.length);
  const polygon = DEMO_SHAPES[selectedIndex % DEMO_SHAPES.length]();

  const nodeCount = 3 + Math.floor(rng() * 3);
  const nodes: SensorNode[] = [];
  const minDistance = 15;

  const isFarEnough = (x: number, z: number): boolean => {
    return nodes.every((n) => Math.hypot(n.x - x, n.z - z) >= minDistance);
  };

  const moisturePresets = [
    () => Math.floor(rng() * 25),
    () => 30 + Math.floor(rng() * 40),
    () => 75 + Math.floor(rng() * 25),
  ];

  for (let i = 0; i < nodeCount; i++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const point = randomPointInPolygon(polygon, rng);
      if (!point) continue;

      if (isFarEnough(point.x, point.z)) {
        const moisture = i < 3 ? moisturePresets[i]() : Math.floor(rng() * 100);

        nodes.push({
          id: `sensor-${i + 1}`,
          x: point.x,
          z: point.z,
          moisture,
          airTemperature: 15 + rng() * 25,
          airHumidity: 20 + Math.floor(rng() * 70),
        });
        break;
      }
    }
  }

  return { polygon, nodes };
}

export function getDemoShape(
  name:
    | "rectangle"
    | "l-shape"
    | "irregular"
    | "pentagon"
    | "with-hole"
    | "trapezoid"
    | "hexagon"
    | "tiny"
    | "huge",
): FieldPolygon {
  const shapeMap: Record<string, number> = {
    rectangle: 0,
    "l-shape": 1,
    irregular: 2,
    pentagon: 3,
    "with-hole": 4,
    trapezoid: 5,
    hexagon: 6,
    tiny: 7,
    huge: 8,
  };
  return DEMO_SHAPES[shapeMap[name]]();
}

const DEMO_FIELDS_CONFIG: Array<{
  id: string;
  name: string;
  area: number;
  shapeIndex: number;
}> = [
  { id: "field-1", name: "Ana Tarla",     area: 12.5, shapeIndex: 0 },
  { id: "field-2", name: "Kuzey Parsel",  area: 8.2,  shapeIndex: 1 },
  { id: "field-3", name: "Batı Tarla",    area: 15.0, shapeIndex: 3 },
  { id: "field-4", name: "Güney Parsel",  area: 10.4, shapeIndex: 5 },
  { id: "field-5", name: "Doğu Tarla",    area: 18.7, shapeIndex: 6 },
];

export function getDemoFields(): FieldSummary[] {
  return DEMO_FIELDS_CONFIG.map(({ id, name, area }) => ({ id, name, area }));
}

export function generateDemoDashboardData(fieldId: string): DashboardData {
  const fieldConfig =
    DEMO_FIELDS_CONFIG.find((f) => f.id === fieldId) ?? DEMO_FIELDS_CONFIG[0];

  const seed =
    fieldId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) * 1000;
  const fieldData = generateDemoFieldData(seed, fieldConfig.shapeIndex);

  // IrrigationDetailScreen node.zone_id bekliyor — tek zone'a bagla
  const zoneId = `demo-zone-${fieldConfig.id}`;
  fieldData.nodes = fieldData.nodes.map((n) => ({ ...n, zone_id: zoneId }));

  const avgMoisture =
    fieldData.nodes.length > 0
      ? Math.round(
          fieldData.nodes.reduce((sum, n) => sum + n.moisture, 0) /
            fieldData.nodes.length,
        )
      : 50;

  const avgTemp =
    fieldData.nodes.length > 0
      ? Math.round(
          (fieldData.nodes.reduce((sum, n) => sum + n.airTemperature, 0) /
            fieldData.nodes.length) *
            10,
        ) / 10
      : 25;

  const avgHumidity =
    fieldData.nodes.length > 0
      ? Math.round(
          fieldData.nodes.reduce((sum, n) => sum + n.airHumidity, 0) /
            fieldData.nodes.length,
        )
      : 60;

  const now = new Date();
  const nextNoon = new Date(now);
  nextNoon.setHours(12, 0, 0, 0);
  if (nextNoon <= now) {
    nextNoon.setDate(nextNoon.getDate() + 1);
  }

  // Son okuma zamani - demo icin 15-45 dk once
  const lastReadingDate = new Date(now);
  lastReadingDate.setMinutes(
    lastReadingDate.getMinutes() - (15 + Math.floor(Math.random() * 30)),
  );

  return {
    weather: {
      airTemperature: avgTemp,
      airHumidity: avgHumidity,
    },
    irrigation: {
      nextIrrigationTime: nextNoon.toISOString(),
      isScheduled: true,
    },
    sensors: {
      soilMoisture: avgMoisture,
      nodeCount: fieldData.nodes.length,
      lastReadingTime: lastReadingDate.toISOString(),
    },
    field: fieldData,
  };
}

// ── Demo zones (her field icin bir zone) ────────────────────────────────

export function getDemoZones(): Zone[] {
  return DEMO_FIELDS_CONFIG.map((f, i) => ({
    zone_id: `demo-zone-${f.id}`,
    zone_name: `Bölge ${i + 1}`,
    field_id: f.id,
    field_name: f.name,
    farm_id: "demo-farm",
    farm_name: "Demo Çiftliği",
  }));
}

// ── Sensor gecmisi ──────────────────────────────────────────────────────

interface DemoSensorReading {
  id: string;
  node_id: string;
  created_at: string;
  temperature: number | null;
  humidity: number | null;
  sm_percent: number | null;
  raw_sm_value: number | null;
  et0_instant: number | null;
}

export function generateDemoSensorHistory(
  fieldId: string,
  hours: number,
): {
  field_id: string;
  field_name: string;
  hours: number;
  reading_count: number;
  readings: DemoSensorReading[];
} {
  const fieldConfig =
    DEMO_FIELDS_CONFIG.find((f) => f.id === fieldId) ?? DEMO_FIELDS_CONFIG[0];
  const seed =
    fieldId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) * 1000;
  const rng = seededRandom(seed);

  const fieldData = generateDemoFieldData(seed, fieldConfig.shapeIndex);
  const nodes = fieldData.nodes.length > 0 ? fieldData.nodes : [
    { id: "demo-node-1", x: 50, z: 50, moisture: 45, airTemperature: 22, airHumidity: 60 },
  ];

  // Veri yogunlugu: 1 saatte 4 okuma (~15 dk araliklarla)
  const samplesPerHour = 4;
  const totalSamples = Math.max(1, hours * samplesPerHour);
  const intervalMs = (hours * 3600 * 1000) / totalSamples;

  const readings: DemoSensorReading[] = [];
  const now = Date.now();

  for (let i = totalSamples - 1; i >= 0; i--) {
    const ts = new Date(now - i * intervalMs).toISOString();
    for (const node of nodes) {
      // Diurnal sicaklik dalgalanmasi + rastgele sapma
      const hourOfDay = new Date(now - i * intervalMs).getHours();
      const diurnal = Math.sin((hourOfDay / 24) * Math.PI * 2 - Math.PI / 2);
      const tempBase = node.airTemperature + diurnal * 6 + (rng() - 0.5) * 2;
      const humBase = Math.max(
        20,
        Math.min(95, node.airHumidity - diurnal * 10 + (rng() - 0.5) * 5),
      );
      // SM yavasca azalir (sulamayla artar — basit dogrusal model)
      const elapsedH = (totalSamples - 1 - i) / samplesPerHour;
      const smTrend = node.moisture - elapsedH * 0.4 + (rng() - 0.5) * 2;
      const smClamped = Math.max(5, Math.min(98, smTrend));

      readings.push({
        id: `demo-rd-${i}-${node.id}`,
        node_id: node.id,
        created_at: ts,
        temperature: Math.round(tempBase * 10) / 10,
        humidity: Math.round(humBase),
        sm_percent: Math.round(smClamped * 10) / 10,
        raw_sm_value: Math.round(2400 - smClamped * 18),
        et0_instant: Math.round((diurnal > 0 ? diurnal * 0.4 : 0.05) * 100) / 100,
      });
    }
  }

  return {
    field_id: fieldConfig.id,
    field_name: fieldConfig.name,
    hours,
    reading_count: readings.length,
    readings,
  };
}

export function generateDemoZoneLatest(zoneId: string): {
  zone_id: string;
  zone_name: string;
  sensors: Array<{
    sensor_node_id: string;
    sensor_type: string;
    latest_reading?: DemoSensorReading;
  }>;
} {
  const fieldId = zoneId.replace("demo-zone-", "");
  const fieldConfig =
    DEMO_FIELDS_CONFIG.find((f) => f.id === fieldId) ?? DEMO_FIELDS_CONFIG[0];
  const seed =
    fieldId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) * 1000;
  const fieldData = generateDemoFieldData(seed, fieldConfig.shapeIndex);

  const now = new Date().toISOString();

  return {
    zone_id: zoneId,
    zone_name: "Bölge 1",
    sensors: fieldData.nodes.map((n, i) => ({
      sensor_node_id: n.id,
      sensor_type: "soil_moisture",
      latest_reading: {
        id: `demo-latest-${i}`,
        node_id: n.id,
        created_at: now,
        temperature: Math.round(n.airTemperature * 10) / 10,
        humidity: Math.round(n.airHumidity),
        sm_percent: Math.round(n.moisture * 10) / 10,
        raw_sm_value: Math.round(2400 - n.moisture * 18),
        et0_instant: 0.15,
      },
    })),
  };
}

// ── Karbon ayak izi ─────────────────────────────────────────────────────

export function getDemoActivityTypes(): Record<string, ActivityType[]> {
  return {
    YAKIT: [
      { activity_type_id: 101, name: "Dizel (traktör)", unit: "L" },
      { activity_type_id: 102, name: "Benzin", unit: "L" },
    ],
    GUBRE: [
      { activity_type_id: 201, name: "Üre azot", unit: "kg" },
      { activity_type_id: 202, name: "Amonyum sülfat", unit: "kg" },
    ],
    ELEKTRIK: [
      { activity_type_id: 301, name: "Şebeke elektriği", unit: "kWh" },
      { activity_type_id: 302, name: "Pompalama", unit: "kWh" },
    ],
  };
}

export function getDemoCarbonSummary(): CarbonSummary {
  return {
    total_emission: 482.7,
    by_category: [
      { category: "YAKIT", total: 268.4, count: 12 },
      { category: "GUBRE", total: 152.5, count: 6 },
      { category: "ELEKTRIK", total: 61.8, count: 9 },
    ],
  };
}

export function getDemoCarbonLogsSeed(): CarbonLog[] {
  const today = new Date();
  const daysAgo = (n: number) =>
    new Date(today.getTime() - n * 86400 * 1000).toISOString();
  return [
    {
      carbon_log_id: "demo-clog-1",
      farm_id: "demo-farm",
      activity_type_id: 101,
      activity_date: daysAgo(2),
      activity_amount: 18,
      emission_amount: 47.16,
      notes: "Tarla sürümü",
      created_at: daysAgo(2),
      activity_type: { name: "Dizel (traktör)", category: "YAKIT", unit: "L" },
    },
    {
      carbon_log_id: "demo-clog-2",
      farm_id: "demo-farm",
      activity_type_id: 201,
      activity_date: daysAgo(7),
      activity_amount: 25,
      emission_amount: 22.5,
      notes: null,
      created_at: daysAgo(7),
      activity_type: { name: "Üre azot", category: "GUBRE", unit: "kg" },
    },
    {
      carbon_log_id: "demo-clog-3",
      farm_id: "demo-farm",
      activity_type_id: 301,
      activity_date: daysAgo(1),
      activity_amount: 42,
      emission_amount: 18.06,
      notes: "Sulama pompasi",
      created_at: daysAgo(1),
      activity_type: { name: "Şebeke elektriği", category: "ELEKTRIK", unit: "kWh" },
    },
  ];
}

// ── Aktif uyarilar ──────────────────────────────────────────────────────

export function getDemoActiveAlerts(fieldId: string): Array<{
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  created_at: string;
}> {
  const config =
    DEMO_FIELDS_CONFIG.find((f) => f.id === fieldId) ?? DEMO_FIELDS_CONFIG[0];
  const now = new Date();
  return [
    {
      id: "demo-alert-1",
      severity: "medium",
      title: `${config.name} — Düşük toprak nemi`,
      detail: "Bölge 1 sensörü %22 nem ölçtü; sulama planı önerilir.",
      created_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-alert-2",
      severity: "low",
      title: "Sensör pili düşük",
      detail: "Sensor-2 pil %18 — sonraki ziyarette pil değişimi planlayın.",
      created_at: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
    },
  ];
}

// ── Disease detection synthesizer ───────────────────────────────────────
// liveScanResult > hintedLabel > "uncertain" fallback

interface SynthesizeArgs {
  imageUri: string;
  detectionId: string;
  imageUuid: string;
  hintedLabel?: string | null;
  liveScanResult?: {
    className?: string;
    confidence?: number;
    allProbs?: Record<string, number>;
    timestamp?: number;
  } | null;
  folderId?: string | null;
}

const DISEASE_CLASSES = [
  "bacterial_spot",
  "corn_common_rust",
  "corn_gray_leaf_spot",
  "corn_northern_leaf_blight",
  "early_blight",
  "healthy",
  "late_blight",
  "leaf_mold",
  "mosaic_virus",
  "powdery_mildew",
  "septoria_leaf_spot",
  "spider_mites",
  "target_spot",
  "yellow_leaf_curl_virus",
];

export function synthesizeDemoDetection(args: SynthesizeArgs): DiseaseDetection {
  const now = new Date();
  const completedAt = now.toISOString();

  // 1) Hint > 2) live scan > 3) uncertain fallback
  if (args.hintedLabel) {
    const conf = 0.78 + Math.random() * 0.15;
    return makeDetection(args, args.hintedLabel, conf, "confident", completedAt);
  }

  const live = args.liveScanResult;
  if (
    live?.className &&
    typeof live.confidence === "number" &&
    live.confidence >= 0.55
  ) {
    return makeDetection(
      args,
      live.className,
      live.confidence,
      "confident",
      completedAt,
      live.allProbs,
    );
  }

  const plausibles = ["healthy", "early_blight", "leaf_mold", "powdery_mildew"];
  const top = plausibles[Math.floor(Math.random() * plausibles.length)];
  return makeDetection(args, top, 0.42 + Math.random() * 0.12, "uncertain", completedAt);
}

function makeDetection(
  args: SynthesizeArgs,
  topLabel: string,
  topConf: number,
  status: "confident" | "uncertain",
  completedAt: string,
  allProbsHint?: Record<string, number>,
): DiseaseDetection {
  const allPreds: Record<string, number> = allProbsHint
    ? { ...allProbsHint }
    : (() => {
        const remainder = Math.max(0, 1 - topConf);
        const rest: Record<string, number> = {};
        let restSum = 0;
        for (const c of DISEASE_CLASSES) {
          if (c === topLabel) continue;
          const r = (c.charCodeAt(0) * 31 + c.length * 7) % 100;
          rest[c] = r / 100;
          restSum += rest[c];
        }
        if (restSum > 0) {
          for (const c of Object.keys(rest)) {
            rest[c] = (rest[c] / restSum) * remainder;
          }
        }
        rest[topLabel] = topConf;
        return rest;
      })();

  return {
    detection_id: args.detectionId,
    user_id: "0",
    image_uuid: args.imageUuid,
    image_s3_key: "demo://local",
    status: "COMPLETED",
    uploaded_at: completedAt,
    processing_started_at: completedAt,
    completed_at: completedAt,
    detected_disease: topLabel,
    confidence: topConf,
    confidence_score: topConf,
    all_predictions: allPreds,
    recommendations: recommendationsFor(topLabel),
    error_message: null,
    imageUrl: args.imageUri,
    confidence_status: status,
    top_guess: topLabel,
  };
}

// ── Bundled sample disease images ───────────────────────────────────────
// Yeni sample: require() satirini ekle + dosyayi assets/demo/disease/ altina koy

export interface DemoSampleImage {
  /** Truth label (lowercase snake) — modelin sinif adlariyla esleser */
  label: string;
  /** require()'den dönen module id; expo-asset bunu file:// URI'ye cevirir */
  module: number;
  /** Kullanici dostu kisa ad */
  display: string;
}

// Array bos olursa kamera Sample butonu otomatik gizlenir.
export const DEMO_SAMPLE_IMAGES: DemoSampleImage[] = [
  { label: "healthy",                module: require("../../../assets/demo/disease/healthy_1.jpg"),                display: "Sağlıklı yaprak" },
  { label: "early_blight",           module: require("../../../assets/demo/disease/early_blight_1.jpg"),           display: "Erken Yaprak Yanıklığı" },
  { label: "late_blight",            module: require("../../../assets/demo/disease/late_blight_1.jpg"),            display: "Geç Yaprak Yanıklığı" },
  { label: "leaf_mold",              module: require("../../../assets/demo/disease/leaf_mold_1.jpg"),              display: "Yaprak Küfü" },
  { label: "mosaic_virus",           module: require("../../../assets/demo/disease/mosaic_virus_1.jpg"),           display: "Mozaik Virüsü" },
  { label: "septoria_leaf_spot",     module: require("../../../assets/demo/disease/septoria_leaf_spot_1.jpg"),     display: "Septoria Yaprak Lekesi" },
  { label: "yellow_leaf_curl_virus", module: require("../../../assets/demo/disease/yellow_leaf_curl_virus_1.jpg"), display: "Sarı Yaprak Kıvırcık Virüsü" },
  { label: "bacterial_spot",         module: require("../../../assets/demo/disease/bacterial_spot_1.jpg"),         display: "Bakteriyel Leke" },
  { label: "spider_mites",           module: require("../../../assets/demo/disease/spider_mites_1.jpg"),           display: "Örümcek Akarı" },
];
