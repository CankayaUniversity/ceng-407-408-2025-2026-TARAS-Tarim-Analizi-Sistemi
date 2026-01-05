import { PrismaClient } from '@prisma/client';
import {
  FieldListItem,
  DashboardResponse,
  DashboardNode,
  PolygonData,
} from '../types';

const prisma = new PrismaClient();

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
    }))
  );
}

// check if user owns this field
export async function checkFieldAccess(
  userId: string,
  fieldId: string
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
  fieldId: string
): Promise<DashboardResponse | null> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    include: {
      zones: {
        include: {
          sensor_nodes: {
            include: {
              readings: {
                orderBy: { created_at: 'desc' },
                take: 1,
              },
            },
          },
          jobs: {
            where: { status: 'PENDING' },
            orderBy: { created_at: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!field) {
    return null;
  }

  // collect sensor data
  const allNodes: DashboardNode[] = [];
  let totalMoisture = 0;
  let totalTemperature = 0;
  let totalHumidity = 0;
  let readingCount = 0;

  for (const zone of field.zones) {
    for (const node of zone.sensor_nodes) {
      const latestReading = node.readings[0];

      if (latestReading) {
        const moisture = latestReading.sm_percent ?? 0;
        const temperature = latestReading.temperature ?? 0;
        const humidity = latestReading.humidity ?? 0;

        totalMoisture += moisture;
        totalTemperature += temperature;
        totalHumidity += humidity;
        readingCount++;

        allNodes.push({
          id: node.node_id,
          x: node.x ?? 0,
          z: node.z ?? 0,
          moisture,
          airTemperature: temperature,
          airHumidity: humidity,
        });
      } else {
        // no readings yet
        allNodes.push({
          id: node.node_id,
          x: node.x ?? 0,
          z: node.z ?? 0,
          moisture: 0,
          airTemperature: 0,
          airHumidity: 0,
        });
      }
    }
  }

  // calc averages
  const avgMoisture = readingCount > 0 ? totalMoisture / readingCount : 0;
  const avgTemperature = readingCount > 0 ? totalTemperature / readingCount : 0;
  const avgHumidity = readingCount > 0 ? totalHumidity / readingCount : 0;

  // find next irrigation
  let nextIrrigationTime: string | null = null;
  let isScheduled = false;

  for (const zone of field.zones) {
    const job = zone.jobs[0];
    if (job) {
      const scheduledTime = job.actual_start_time ?? job.created_at;
      if (scheduledTime) {
        if (
          !nextIrrigationTime ||
          scheduledTime < new Date(nextIrrigationTime)
        ) {
          nextIrrigationTime = scheduledTime.toISOString();
          isScheduled = true;
        }
      }
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
