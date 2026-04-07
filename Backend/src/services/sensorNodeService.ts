import { prisma } from "../config/database";

export async function getSensorNodeWithHierarchy(nodeId: string) {
  return prisma.sensorNode.findUnique({
    where: { node_id: nodeId },
    include: {
      zone: {
        include: {
          field: {
            include: {
              farm: true,
            },
          },
        },
      },
      gateway: true,
    },
  });
}

export async function getSensorNodesForZone(
  zoneId: string,
  readingLimit: number = 10,
) {
  const now = new Date();
  return prisma.sensorNode.findMany({
    where: { zone_id: zoneId },
    include: {
      gateway: true,
      readings: {
        where: { created_at: { lte: now } },
        orderBy: { created_at: "desc" },
        take: readingLimit,
      },
    },
  });
}

export async function getLatestReading(nodeId: string) {
  const now = new Date();
  return prisma.sensorReading.findFirst({
    where: { node_id: nodeId, created_at: { lte: now } },
    orderBy: { created_at: "desc" },
    include: {
      node: {
        include: {
          zone: {
            include: {
              details: true,
              field: {
                include: { farm: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function getReadingsInTimeRange(
  nodeId: string,
  startTime: Date,
  endTime: Date,
) {
  return prisma.sensorReading.findMany({
    where: {
      node_id: nodeId,
      created_at: {
        gte: startTime,
        lte: endTime,
      },
    },
    orderBy: { created_at: "asc" },
  });
}

export async function getZoneWithAdaptiveControl(zoneId: string) {
  const now = new Date();
  return prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      details: true,
      sensor_nodes: {
        include: {
          readings: {
            where: { created_at: { lte: now } },
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
      },
      kc_history: {
        orderBy: { created_at: "desc" },
        take: 10,
      },
      plantings: {
        where: { is_active: true },
        include: { crop: true },
      },
    },
  });
}

export async function updateZoneAdaptiveParams(
  zoneId: string,
  params: {
    current_kc?: number;
    current_irrigation_gain?: number;
    target_sm_percent?: number;
    critical_sm_percent?: number;
  },
) {
  return prisma.zoneDetail.upsert({
    where: { zone_id: zoneId },
    update: {
      ...params,
      updated_at: new Date(),
    },
    create: {
      zone_id: zoneId,
      ...params,
    },
  });
}

export async function logKcCalibration(data: {
  zone_id: string;
  window_start: Date;
  window_end: Date;
  et0_sum_12h: number;
  sm_loss_12h: number;
  calculated_ratio: number;
  old_kc: number;
  new_suggested_kc: number;
  applied_to_config?: boolean;
}) {
  return prisma.kcCalibrationHistory.create({
    data,
  });
}

export async function createIrrigationJob(data: {
  zone_id: string;
  trigger_reading_id: bigint;
  reasoning: string;
  recommended_duration_min: number;
}) {
  return prisma.irrigationJob.create({
    data: {
      ...data,
      status: "PENDING",
    },
    include: {
      zone: {
        include: {
          details: true,
          field: true,
        },
      },
      trigger_reading: true,
    },
  });
}

export async function getPendingJobsForZone(zoneId: string) {
  return prisma.irrigationJob.findMany({
    where: {
      zone_id: zoneId,
      status: "PENDING",
    },
    orderBy: { created_at: "asc" },
    include: {
      trigger_reading: true,
      zone: {
        include: { details: true },
      },
    },
  });
}

export async function updateJobExecution(
  jobId: string,
  data: {
    status: "EXECUTED" | "SKIPPED" | "ANALYZED";
    actual_start_time?: Date;
    actual_duration_min?: number;
    result_reading_id?: bigint;
  },
) {
  return prisma.irrigationJob.update({
    where: { job_id: jobId },
    data,
  });
}

export async function getIrrigationHistory(zoneId: string, limit: number = 20) {
  return prisma.irrigationJob.findMany({
    where: { zone_id: zoneId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      trigger_reading: true,
      result_reading: true,
    },
  });
}

export async function getUserFarmsWithSensors(userId: string) {
  const now = new Date();
  return prisma.farm.findMany({
    where: { user_id: userId },
    include: {
      fields: {
        include: {
          zones: {
            include: {
              details: true,
              sensor_nodes: {
                select: {
                  node_id: true,
                  status: true,
                  battery_level: true,
                  x: true,
                  z: true,
                  readings: {
                    where: { created_at: { lte: now } },
                    orderBy: { created_at: "desc" },
                    take: 1,
                    select: {
                      id: true,
                      sm_percent: true,
                      temperature: true,
                      humidity: true,
                      created_at: true,
                    },
                  },
                },
              },
              plantings: {
                where: { is_active: true },
                include: { crop: true },
              },
            },
          },
        },
      },
      gateways: {
        include: {
          sensor_nodes: true,
        },
      },
    },
  });
}

export async function getFarmDashboard(farmId: string) {
  const now = new Date();
  const farm = await prisma.farm.findUnique({
    where: { farm_id: farmId },
    include: {
      fields: {
        include: {
          zones: {
            include: {
              details: true,
              sensor_nodes: {
                include: {
                  readings: {
                    where: { created_at: { lte: now } },
                    orderBy: { created_at: "desc" },
                    take: 1,
                  },
                },
              },
              jobs: {
                where: { status: "PENDING" },
              },
            },
          },
        },
      },
    },
  });

  const totalZones =
    farm?.fields.reduce((acc, f) => acc + f.zones.length, 0) || 0;
  const activeSensors =
    farm?.fields.reduce(
      (acc, f) =>
        acc +
        f.zones.reduce(
          (zAcc, z) =>
            zAcc + z.sensor_nodes.filter((n) => n.status === "ACTIVE").length,
          0,
        ),
      0,
    ) || 0;
  const pendingJobs =
    farm?.fields.reduce(
      (acc, f) => acc + f.zones.reduce((zAcc, z) => zAcc + z.jobs.length, 0),
      0,
    ) || 0;

  return {
    farm,
    summary: {
      totalZones,
      activeSensors,
      pendingJobs,
    },
  };
}

export async function getFieldSensorHistory(
  fieldId: string,
  hours: number = 72,
) {
  const now = new Date();
  const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    include: {
      zones: {
        include: {
          sensor_nodes: {
            include: {
              readings: {
                where: {
                  created_at: {
                    gte: startTime,
                    lte: now,
                  },
                },
                orderBy: { created_at: "asc" },
                take: 5000,
                select: {
                  id: true,
                  node_id: true,
                  created_at: true,
                  temperature: true,
                  humidity: true,
                  sm_percent: true,
                  raw_sm_value: true,
                  et0_instant: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!field) return null;

  // grab all readings and fix the BigInt issue
  const allReadings = field.zones.flatMap((zone) =>
    zone.sensor_nodes.flatMap((node) =>
      node.readings.map((reading) => ({
        ...reading,
        id: reading.id.toString(),
      })),
    ),
  );

  return {
    field_id: field.field_id,
    field_name: field.name,
    hours,
    reading_count: allReadings.length,
    readings: allReadings,
  };
}

export default {
  getSensorNodeWithHierarchy,
  getSensorNodesForZone,
  getLatestReading,
  getReadingsInTimeRange,
  getZoneWithAdaptiveControl,
  updateZoneAdaptiveParams,
  logKcCalibration,
  createIrrigationJob,
  getPendingJobsForZone,
  updateJobExecution,
  getIrrigationHistory,
  getUserFarmsWithSensors,
  getFarmDashboard,
  getFieldSensorHistory,
};
