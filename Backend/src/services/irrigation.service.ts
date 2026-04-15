import { prisma } from "../config/database";

export async function getIrrigationPreviewInput(zoneId: string) {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      field: true,
    },
  });

  if (!zone) {
    throw new Error("Zone not found");
  }

  if (!zone.field) {
    throw new Error("Field data not found for zone");
  }

  const planting = await prisma.planting.findFirst({
    where: {
      zone_id: zoneId,
      is_active: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!planting) {
    throw new Error("No active planting found for zone");
  }

  const node = await prisma.sensorNode.findFirst({
    where: {
      zone_id: zoneId,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  if (!node) {
    throw new Error("No sensor node found for zone");
  }

  const latestReading = await prisma.sensorReading.findFirst({
    where: {
      node_id: node.node_id,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!latestReading) {
    throw new Error("No sensor reading found for zone");
  }

  const fieldRow = {
    zone_id: zone.zone_id,
    field_id: zone.field_id,
    crop_name: zone.field.crop_name,
    environment_type: zone.field.environment_type,
    irrigation_mode: zone.field.irrigation_mode,
    ml_per_sm_percent: zone.field.ml_per_sm_percent,
    sm_percent_per_100ml: zone.field.sm_percent_per_100ml,
    irrigation_gain_mm_per_100ml: zone.field.irrigation_gain_mm_per_100ml,
    default_check_after_min: zone.field.default_check_after_min ?? 60,
  };

  const sensorRow = {
    id: latestReading.id.toString(),
    node_id: latestReading.node_id,
    sm_percent: latestReading.sm_percent,
    temperature: latestReading.temperature,
    humidity: latestReading.humidity,
    created_at: latestReading.created_at,
  };

  const plantingRow = {
    planting_id: planting.planting_id,
    zone_id: planting.zone_id,
    growth_stage: planting.growth_stage,
    planting_date: planting.planting_date,
    is_active: planting.is_active,
    created_at: planting.created_at,
  };

  return {
    zone_id: zone.zone_id,
    field_id: zone.field_id,
    node_id: node.node_id,
    fieldRow,
    sensorRow,
    plantingRow,
  };
}