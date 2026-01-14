// Demo veri uretici - test amacli sahte tarla ve sensor verisi
// generateDemoFieldData, getDemoFields, generateDemoDashboardData

import type { FieldPolygon, SensorNode, FieldData } from "./fieldPlaceholder";
import type { FieldSummary, DashboardData } from "./api";

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
  { id: "field-1", name: "Ana Tarla", area: 12.5, shapeIndex: 0 },
  { id: "field-2", name: "Kuzey Parsel", area: 8.2, shapeIndex: 1 },
  { id: "field-3", name: "Batı Tarla", area: 15.0, shapeIndex: 3 },
  { id: "field-4", name: "Test: Küçük Alan", area: 0.025, shapeIndex: 7 },
  { id: "field-5", name: "Test: Büyük Alan", area: 600, shapeIndex: 8 },
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
