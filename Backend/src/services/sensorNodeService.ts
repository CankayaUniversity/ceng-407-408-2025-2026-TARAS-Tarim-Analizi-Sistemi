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

export async function getIrrigationHistory(zoneId: string, limit: number = 20) {
  return prisma.irrigationJob.findMany({
    where: { zone_id: zoneId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      trigger_reading: true,
      followups: {
        orderBy: { check_time: "desc" },
        take: 1,
        include: {
          result_reading: true,
        },
      },
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
  range?: { startDate?: Date; endDate?: Date },
) {
  // Iki mod: (a) rolling — now'dan geriye `hours` saat (varsayilan), (b) custom takvim
  // araligi — range.startDate/endDate verilirse onlar kullanilir. endDate yoksa now.
  const endTime = range?.endDate ?? new Date();
  const startTime =
    range?.startDate ?? new Date(endTime.getTime() - hours * 60 * 60 * 1000);

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
                    lte: endTime,
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
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    reading_count: allReadings.length,
    readings: allReadings,
  };
}

// --- LLM ozet araclari icin kompakt istatistik (ham satir cekmeden) ---
// field VEYA zone kapsaminda, [startTime,endTime] penceresinde her metrik icin
// avg/min/max + pencerenin ilk/son okumasi. Postgres'te toplulastirilir: en fazla ~3
// sorgu, ~2 satir materialize edilir (maliyet/token minimum). get_field_history ve
// get_zone_history bunu kullanir; gorsel trend frontend Cizelge ekranina aittir.
interface MetricAgg {
  temperature: number | null;
  humidity: number | null;
  sm_percent: number | null;
}
interface StatsReadingPoint {
  created_at: Date | null;
  temperature: number | null;
  humidity: number | null;
  sm_percent: number | null;
}
export interface SensorStats {
  node_count: number;
  reading_count: number;
  avg: MetricAgg;
  min: MetricAgg;
  max: MetricAgg;
  first: StatsReadingPoint | null;
  last: StatsReadingPoint | null;
}

export async function getSensorStats(
  scope: { fieldId?: string; zoneId?: string },
  startTime: Date,
  endTime: Date,
): Promise<SensorStats> {
  const empty: MetricAgg = {
    temperature: null,
    humidity: null,
    sm_percent: null,
  };
  const emptyStats: SensorStats = {
    node_count: 0,
    reading_count: 0,
    avg: empty,
    min: empty,
    max: empty,
    first: null,
    last: null,
  };

  // Kapsam zorunlu — ikisi de yoksa filtre tum tabloyu kapsardi, bos don.
  if (!scope.zoneId && !scope.fieldId) return emptyStats;

  // Kapsamdaki node'lari coz: tek zone -> o zone'un node'lari; field -> tum zone'lari.
  const nodes = await prisma.sensorNode.findMany({
    where: scope.zoneId
      ? { zone_id: scope.zoneId }
      : { zone: { field_id: scope.fieldId } },
    select: { node_id: true },
  });
  const nodeIds = nodes.map((n) => n.node_id);
  if (nodeIds.length === 0) return emptyStats;

  const where = {
    node_id: { in: nodeIds },
    created_at: { gte: startTime, lte: endTime },
  };

  // Tek sorguda avg/min/max + toplam okuma sayisi — ham satir donmez.
  const agg = await prisma.sensorReading.aggregate({
    where,
    _count: true,
    _avg: { temperature: true, humidity: true, sm_percent: true },
    _min: { temperature: true, humidity: true, sm_percent: true },
    _max: { temperature: true, humidity: true, sm_percent: true },
  });

  // Yon (rising/falling) icin pencerenin ilk + son okumasi — 2 satir.
  const pick = {
    created_at: true,
    temperature: true,
    humidity: true,
    sm_percent: true,
  } as const;
  const [first, last] = await Promise.all([
    prisma.sensorReading.findFirst({
      where,
      orderBy: { created_at: "asc" },
      select: pick,
    }),
    prisma.sensorReading.findFirst({
      where,
      orderBy: { created_at: "desc" },
      select: pick,
    }),
  ]);

  return {
    node_count: nodeIds.length,
    reading_count: agg._count,
    avg: agg._avg,
    min: agg._min,
    max: agg._max,
    first,
    last,
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
  getPendingJobsForZone,
  getIrrigationHistory,
  getUserFarmsWithSensors,
  getFarmDashboard,
  getFieldSensorHistory,
  getSensorStats,
};
