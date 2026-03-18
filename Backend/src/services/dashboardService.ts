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
      x: number | null;
      z: number | null;
      sm_percent: number | null;
      temperature: number | null;
      humidity: number | null;
      created_at: Date | null;
    }[]>(
      `SELECT sn.node_id, sn.x, sn.z, lr.sm_percent, lr.temperature, lr.humidity, lr.created_at
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

export default {
  getUserFields,
  checkFieldAccess,
  getFieldDashboard,
};
