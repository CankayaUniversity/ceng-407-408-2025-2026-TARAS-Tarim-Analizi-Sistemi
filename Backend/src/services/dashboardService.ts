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

// get dashboard data for a field
export async function getFieldDashboard(
  fieldId: string,
): Promise<DashboardResponse | null> {
  // Tek sorguda tarla + node + son okuma + pending job bilgisi al
  const [field, nodeRows, jobRows] = await Promise.all([
    // 1) Tarla polygon verisi
    prisma.field.findUnique({
      where: { field_id: fieldId },
      select: { field_id: true, polygon: true },
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
  fieldType: "GREENHOUSE" | "POT_AREA";
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

  const environmentType =
    input.fieldType === "GREENHOUSE" ? "GREENHOUSE" : "POT_AREA";

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
