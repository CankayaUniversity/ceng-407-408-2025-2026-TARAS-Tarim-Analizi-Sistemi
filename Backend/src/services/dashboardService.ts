import { prisma } from "../config/database";
import {
  FieldListItem,
  DashboardResponse,
  DashboardNode,
  PolygonData,
} from "../types";

// get all fields for a user
export async function getUserFields(userId: string): Promise<FieldListItem[]> {
  const farms = await prisma.farm.findMany({
    where: { user_id: userId },
    include: {
      fields: {
        select: {
          field_id: true,
          name: true,
          area: true,
        },
      },
    },
  });

  return farms.flatMap((farm) =>
    farm.fields.map((field) => ({
      id: field.field_id,
      name: field.name,
      area: field.area ?? 0,
    })),
  );
}

// check if user owns this field
export async function checkFieldAccess(
  userId: string,
  fieldId: string,
): Promise<boolean> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    include: {
      farm: true,
    },
  });

  if (!field?.farm) {
    return false;
  }

  return field.farm.user_id === userId;
}

// Polygon centroid (shoelace formula) — zone'lar icin sentetik node konumu hesaplar
function polygonCentroid(pts: [number, number][]): { x: number; z: number } {
  const n = pts.length;
  if (n < 3) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = pts[i]!;
    const pj = pts[j]!;
    const cross = pi[0] * pj[1] - pj[0] * pi[1];
    area += cross;
    cx += (pi[0] + pj[0]) * cross;
    cz += (pi[1] + pj[1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }
  const f = 1 / (6 * area);
  return { x: cx * f, z: cz * f };
}

// get dashboard data for a field
export async function getFieldDashboard(
  fieldId: string,
): Promise<DashboardResponse | null> {
  // Tek sorguda tarla + node + son okuma + pending job + zone bilgisi al
  const [field, nodeRows, jobRows, zoneRows] = await Promise.all([
    // 1) Tarla polygon verisi + ortam tipi (sera / saksi)
    prisma.field.findUnique({
      where: { field_id: fieldId },
      select: { field_id: true, polygon: true, environment_type: true },
    }),
    // 2) Node pozisyonlari + son okuma (DISTINCT ON ile tek sorgu)
    prisma.$queryRawUnsafe<{
      node_id: string;
      zone_id: string;
      x: number | null;
      z: number | null;
      sm_percent: number | null;
      temperature: number | null;
      humidity: number | null;
      created_at: Date | null;
    }[]>(
      `SELECT sn.node_id, sn.zone_id, sn.x, sn.z, lr.sm_percent, lr.temperature, lr.humidity, lr.created_at
       FROM sensor_nodes sn
       JOIN zones z ON z.zone_id = sn.zone_id
       LEFT JOIN LATERAL (
         SELECT sr.sm_percent, sr.temperature, sr.humidity, sr.created_at
         FROM sensor_readings sr
         WHERE sr.node_id = sn.node_id
         ORDER BY sr.created_at DESC
         LIMIT 1
       ) lr ON true
       WHERE z.field_id = $1`,
      fieldId,
    ),
    // 3) Pending irrigation job
    prisma.irrigationJob.findFirst({
      where: {
        zone: { field_id: fieldId },
        status: "PENDING",
      },
      orderBy: { created_at: "asc" },
      select: { actual_start_time: true, created_at: true },
    }),
    // 4) Zone polygon'lari — sensor_node'u olmayan zone'lar icin sentetik node uretimi
    prisma.zone.findMany({
      where: { field_id: fieldId },
      select: { zone_id: true, polygon: true },
    }),
  ]);

  if (!field) {
    return null;
  }

  // Sensor verilerini topla
  const allNodes: DashboardNode[] = [];
  let totalMoisture = 0;
  let totalTemperature = 0;
  let totalHumidity = 0;
  let readingCount = 0;
  let latestReadingTime: Date | null = null;

  for (const node of nodeRows) {
    const moisture = node.sm_percent ?? 0;
    const temperature = node.temperature ?? 0;
    const humidity = node.humidity ?? 0;
    const hasReading = node.sm_percent != null;

    if (hasReading) {
      totalMoisture += moisture;
      totalTemperature += temperature;
      totalHumidity += humidity;
      readingCount++;

      if (
        node.created_at &&
        (!latestReadingTime || node.created_at > latestReadingTime)
      ) {
        latestReadingTime = node.created_at;
      }
    }

    allNodes.push({
      id: node.node_id,
      zone_id: node.zone_id,
      x: node.x ?? 0,
      z: node.z ?? 0,
      moisture,
      airTemperature: temperature,
      airHumidity: humidity,
    });
  }

  // Sensor_node'u olmayan zone'lar icin sentetik node uret — zone centroid'inden.
  // Boylece pot tarlalarda her zone bir saksi olarak, seralarda her zone bir
  // Voronoi bolgesi olarak goruntulenebilir.
  const coveredZoneIds = new Set(allNodes.map((n) => n.zone_id));
  for (const zone of zoneRows) {
    if (coveredZoneIds.has(zone.zone_id)) continue;
    const poly = zone.polygon as { exterior?: [number, number][] } | null;
    if (!poly?.exterior?.length) continue;
    const center = polygonCentroid(poly.exterior);
    allNodes.push({
      id: `synth-${zone.zone_id}`,
      zone_id: zone.zone_id,
      x: center.x,
      z: center.z,
      moisture: 0,
      airTemperature: 0,
      airHumidity: 0,
    });
  }

  // calc averages
  const avgMoisture = readingCount > 0 ? totalMoisture / readingCount : 0;
  const avgTemperature = readingCount > 0 ? totalTemperature / readingCount : 0;
  const avgHumidity = readingCount > 0 ? totalHumidity / readingCount : 0;

  // Sulama bilgisi
  let nextIrrigationTime: string | null = null;
  let isScheduled = false;

  if (jobRows) {
    const scheduledTime = jobRows.actual_start_time ?? jobRows.created_at;
    if (scheduledTime) {
      nextIrrigationTime = scheduledTime.toISOString();
      isScheduled = true;
    }
  }

  // get polygon data
  const polygon: PolygonData = field.polygon
    ? (field.polygon as unknown as PolygonData)
    : { exterior: [], holes: [] };

  return {
    weather: {
      airTemperature: Number(avgTemperature.toFixed(1)),
      airHumidity: Number(avgHumidity.toFixed(0)),
    },
    irrigation: {
      nextIrrigationTime,
      isScheduled,
    },
    sensors: {
      soilMoisture: Number(avgMoisture.toFixed(0)),
      nodeCount: allNodes.length,
      lastReadingTime: latestReadingTime
        ? latestReadingTime.toISOString()
        : null,
    },
    field: {
      polygon,
      nodes: allNodes,
      // environment_type acikca set edilmisse onu kullan.
      // NULL ise (eski kayitlar, dogrudan DB insert) zone geometrisinden cikar:
      // Saksi wizard'i her zone icin 8 koseli (octagonal) polygon uretir.
      isPotField:
        field.environment_type === "pot" ||
        (!field.environment_type &&
          zoneRows.length > 0 &&
          zoneRows.every((z) => {
            const p = z.polygon as { exterior?: unknown[] } | null;
            return p?.exterior?.length === 8;
          })),
    },
  };
}

// Hafif envanter — sadece isimler ve ID'ler
export async function getFieldInventory(userId: string) {
  return prisma.farm.findMany({
    where: { user_id: userId },
    select: {
      farm_id: true,
      name: true,
      fields: {
        select: {
          field_id: true,
          name: true,
          crop_name: true,
          zones: {
            select: { zone_id: true, name: true },
          },
        },
      },
    },
  });
}

// create a new field with zones under the user's farm
interface CreateFieldInput {
  fieldName: string;
  cropName?: string;
  fieldType: "greenhouse" | "pot";
  polygon: { exterior: [number, number][]; holes?: [number, number][][] };
  area: number;
  zones: {
    name: string;
    polygon: { exterior: [number, number][]; holes?: [number, number][][] };
  }[];
}

export async function createField(
  userId: string,
  input: CreateFieldInput,
): Promise<FieldListItem> {
  // find the user's farm (each user has exactly one)
  const farm = await prisma.farm.findFirst({
    where: { user_id: userId },
    select: { farm_id: true },
  });

  if (!farm) {
    throw new Error("NO_FARM");
  }

  const environmentType = input.fieldType;

  // create field + zones in a single transaction
  const field = await prisma.$transaction(async (tx) => {
    const newField = await tx.field.create({
      data: {
        farm_id: farm.farm_id,
        name: input.fieldName,
        crop_name: input.cropName || null,
        area: input.area,
        polygon: input.polygon,
        environment_type: environmentType,
      },
    });

    if (input.zones.length > 0) {
      await tx.zone.createMany({
        data: input.zones.map((z) => ({
          field_id: newField.field_id,
          name: z.name,
          polygon: z.polygon,
        })),
      });
    }

    return newField;
  });

  return {
    id: field.field_id,
    name: field.name,
    area: field.area ?? 0,
  };
}

// create a new farm for the user
export interface CreateFarmInput {
  name: string;
  latitude?: number;
  longitude?: number;
  altitude_m?: number;
  location_text?: string;
}

export interface FarmResult {
  farm_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  created_at: Date | null;
}

export async function createFarm(
  userId: string,
  input: CreateFarmInput,
): Promise<FarmResult> {
  const farm = await prisma.farm.create({
    data: {
      user_id: userId,
      name: input.name,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      altitude_m: input.altitude_m ?? null,
      ...(input.location_text ? { location_text: input.location_text } : {}),
    },
    select: {
      farm_id: true,
      name: true,
      latitude: true,
      longitude: true,
      altitude_m: true,
      created_at: true,
    },
  });
  return farm;
}

// fetch elevation from Open-Meteo Elevation API
export async function getElevation(
  latitude: number,
  longitude: number,
): Promise<number> {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status}`);
  }
  const data = (await res.json()) as { elevation?: number[] };
  if (!data.elevation || !Array.isArray(data.elevation) || data.elevation.length === 0) {
    throw new Error("No elevation data returned from Open-Meteo");
  }
  return data.elevation[0]!;
}

export default {
  getUserFields,
  checkFieldAccess,
  getFieldDashboard,
  getFieldInventory,
  createField,
  createFarm,
  getElevation,
};
