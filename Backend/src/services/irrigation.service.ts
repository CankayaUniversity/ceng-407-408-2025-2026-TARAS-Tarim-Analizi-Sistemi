import { Client } from "pg";
import { prisma } from "../config/database";

const TOMATO_POT_RULES = {
  thresholds_by_stage: {
    seedling: {
      rec_sm_min: 45,
      rec_sm_max: 60,
      critical_min: 35,
      target_sm: 52,
    },
    vegetative: {
      rec_sm_min: 50,
      rec_sm_max: 65,
      critical_min: 40,
      target_sm: 57,
    },
    flowering: {
      rec_sm_min: 65,
      rec_sm_max: 80,
      critical_min: 50,
      target_sm: 72,
    },
    fruiting: {
      rec_sm_min: 65,
      rec_sm_max: 80,
      critical_min: 50,
      target_sm: 72,
    },
    ripening: {
      rec_sm_min: 55,
      rec_sm_max: 70,
      critical_min: 40,
      target_sm: 62,
    },
  },
  safety_limits: {
    min_amount_ml: 0,
    max_amount_ml: 400,
  },
} as const;



// KCLER
const TOMATO_GREENHOUSE_RULES = {
  kc_by_stage: {
    seedling: 0.6,
    vegetative: 0.85,
    flowering: 1.15,
    fruiting: 1.15,
    ripening: 0.86,
  },
  safety_limits: {
    min_duration_min: 0,
    max_duration_min: 120,
  },
} as const;


type RecommendationOutput = {
  should_irrigate: boolean;
  start_time: Date | null;
  irrigation_mode: string | null;
  water_amount_ml: number;
  recommended_duration_min: number | null;
  required_water_mm: number;
  predicted_sm_after_check: number;
  recommended_check_after_min: number | null;
  followup_check_time: Date | null;
  urgency_level: string;
  reason: string;
  current_sm: number;
  target_sm: number | null;
  sm_deficit: number;
};


type CalibrationResult = {
  record_count: number;
  learned_ml_per_sm_percent: number | null;
  learned_sm_percent_per_100ml: number | null;
  learned_sm_percent_per_10_min: number | null;
  median_prediction_error: number;
};



function getGrowthStageFromPlantingDate(
  plantingDate: Date,
  currentTime: Date
): string | null {
  const planting = new Date(plantingDate);
  const current = new Date(currentTime);

  const diffMs = current.getTime() - planting.getTime();
  const daysAfterPlanting = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysAfterPlanting < 0) return null;
  if (daysAfterPlanting <= 20) return "seedling";
  if (daysAfterPlanting <= 45) return "vegetative";
  if (daysAfterPlanting <= 75) return "flowering";
  if (daysAfterPlanting <= 105) return "fruiting";
  return "ripening";
}



function resolveGrowthStage(
  plantingRow: {
    growth_stage: string | null;
    planting_date: Date;
  },
  currentTime: Date
): string | null {
  if (plantingRow.growth_stage) {
    return plantingRow.growth_stage;
  }

  if (plantingRow.planting_date) {
    return getGrowthStageFromPlantingDate(
      plantingRow.planting_date,
      currentTime
    );
  }

  return null;
}


function getStageThresholds(growthStage: string) {
  return TOMATO_POT_RULES.thresholds_by_stage[
    growthStage as keyof typeof TOMATO_POT_RULES.thresholds_by_stage
  ] ?? null;
}



function getGreenhouseKc(growthStage: string): number | null {
  return (
    TOMATO_GREENHOUSE_RULES.kc_by_stage[
      growthStage as keyof typeof TOMATO_GREENHOUSE_RULES.kc_by_stage
    ] ?? null
  );
}


function estimateGreenhouseEtoMmPerDay(
  temperature: number,
  humidity: number
): number {
  const saturationVaporPressure =
    0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));

  const actualVaporPressure = saturationVaporPressure * (humidity / 100);
  const vpd = Math.max(0, saturationVaporPressure - actualVaporPressure);

  const baseEto = 2.0;
  const tempFactor = Math.max(0, temperature - 20) * 0.08;
  const vpdFactor = vpd * 0.6;

  return clamp(baseEto + tempFactor + vpdFactor, 1.0, 6.0);
}

// Tam FAO değil, bizim MVP için


function applyGreenhouseDurationLimits(durationMin: number): number {
  return clamp(
    durationMin,
    TOMATO_GREENHOUSE_RULES.safety_limits.min_duration_min,
    TOMATO_GREENHOUSE_RULES.safety_limits.max_duration_min
  );
}



function getUrgency(
  currentSm: number,
  recSmMin: number,
  criticalMin: number
): string {
  if (currentSm <= criticalMin + 5) return "high";
  if (currentSm <= recSmMin + 5) return "medium";
  return "low";
}



function applySafetyLimits(waterAmountMl: number): number {
  let value = waterAmountMl;

  if (value < TOMATO_POT_RULES.safety_limits.min_amount_ml) {
    value = TOMATO_POT_RULES.safety_limits.min_amount_ml;
  }

  if (value > TOMATO_POT_RULES.safety_limits.max_amount_ml) {
    value = TOMATO_POT_RULES.safety_limits.max_amount_ml;
  }

  return value;
}



function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}


function calculateFollowupTimeFromActual(
  actualStartTime: Date,
  minutes = 60
): Date {
  return new Date(actualStartTime.getTime() + minutes * 60 * 1000);
}


// average sm

async function getZoneLatestAverageReading(zoneId: string) {
  const nodes = await prisma.sensorNode.findMany({
    where: {
      zone_id: zoneId,
    },
    select: {
      node_id: true,
    },
  });

  if (nodes.length === 0) {
    throw new Error("No sensor node found for zone");
  }

  const latestReadings = await Promise.all(
    nodes.map((node) =>
      prisma.sensorReading.findFirst({
        where: {
          node_id: node.node_id,
        },
        orderBy: {
          created_at: "desc",
        },
      })
    )
  );

  const validReadings = latestReadings.filter(
    (reading): reading is NonNullable<typeof reading> =>
      reading !== null &&
      reading.sm_percent !== null &&
      reading.temperature !== null &&
      reading.humidity !== null
  );

  if (validReadings.length === 0) {
    throw new Error("No valid sensor reading found for zone");
  }

  const avgSm =
    validReadings.reduce((sum, reading) => sum + reading.sm_percent!, 0) /
    validReadings.length;

  const avgTemperature =
    validReadings.reduce((sum, reading) => sum + reading.temperature!, 0) /
    validReadings.length;

  const avgHumidity =
    validReadings.reduce((sum, reading) => sum + reading.humidity!, 0) /
    validReadings.length;

  const latestCreatedAt = validReadings.reduce((latest, reading) => {
    return reading.created_at! > latest ? reading.created_at! : latest;
  }, validReadings[0]!.created_at!);

  return {
    reading_count: validReadings.length,
    node_count: nodes.length,
    sm_percent: Number(avgSm.toFixed(2)),
    temperature: Number(avgTemperature.toFixed(2)),
    humidity: Number(avgHumidity.toFixed(2)),
    created_at: latestCreatedAt,
  };
}



async function getZoneAverageReadingAfter(zoneId: string, afterTime: Date) {
  const nodes = await prisma.sensorNode.findMany({
    where: {
      zone_id: zoneId,
    },
    select: {
      node_id: true,
    },
  });

  if (nodes.length === 0) {
    return null;
  }

  const readings = await Promise.all(
    nodes.map((node) =>
      prisma.sensorReading.findFirst({
        where: {
          node_id: node.node_id,
          created_at: {
            gte: afterTime,
          },
          sm_percent: {
            not: null,
          },
        },
        orderBy: {
          created_at: "asc",
        },
      })
    )
  );

  const validReadings = readings.filter(
    (reading): reading is NonNullable<typeof reading> =>
      reading !== null && reading.sm_percent !== null
  );

  if (validReadings.length === 0) {
    return null;
  }

  const avgSm =
    validReadings.reduce((sum, reading) => sum + reading.sm_percent!, 0) /
    validReadings.length;

  const checkTime = validReadings.reduce((latest, reading) => {
    return reading.created_at! > latest ? reading.created_at! : latest;
  }, validReadings[0]!.created_at!);

  return {
    reading_count: validReadings.length,
    node_count: nodes.length,
    result_reading_id: validReadings[0]!.id,
    sm_percent: Number(avgSm.toFixed(2)),
    check_time: checkTime,
  };
}

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

  const averageReading = await getZoneLatestAverageReading(zoneId);

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
    irrigation_gain_mm_per_10_min:zone.field.irrigation_gain_mm_per_10_min,
  };

 const sensorRow = {
  id: "zone-average",
  node_id: null,
  sm_percent: averageReading.sm_percent,
  temperature: averageReading.temperature,
  humidity: averageReading.humidity,
  created_at: averageReading.created_at,
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
    node_id: null,
    fieldRow,
    sensorRow,
    plantingRow,
  };
}

export async function getIrrigationPythonPayload(zoneId: string) {
  const preview = await getIrrigationPreviewInput(zoneId);

  return {
    field_row: {
      zone_id: preview.fieldRow.zone_id,
      field_id: preview.fieldRow.field_id,
      crop_name: preview.fieldRow.crop_name,
      environment_type: preview.fieldRow.environment_type,
      irrigation_mode: preview.fieldRow.irrigation_mode,
      ml_per_sm_percent: preview.fieldRow.ml_per_sm_percent,
      sm_percent_per_100ml: preview.fieldRow.sm_percent_per_100ml,
      irrigation_gain_mm_per_100ml: preview.fieldRow.irrigation_gain_mm_per_100ml,
      default_check_after_min: preview.fieldRow.default_check_after_min,
     irrigation_gain_mm_per_10_min:
  preview.fieldRow.irrigation_gain_mm_per_10_min,
    },
    sensor_row: {
      id: preview.sensorRow.id,
      node_id: preview.sensorRow.node_id,
      sm_percent: preview.sensorRow.sm_percent,
      temperature: preview.sensorRow.temperature,
      humidity: preview.sensorRow.humidity,
      created_at: preview.sensorRow.created_at,
    },
    planting_row: {
      planting_id: preview.plantingRow.planting_id,
      zone_id: preview.plantingRow.zone_id,
      growth_stage: preview.plantingRow.growth_stage,
      planting_date: preview.plantingRow.planting_date,
      is_active: preview.plantingRow.is_active,
      created_at: preview.plantingRow.created_at,
    },
  };
}



export async function generateAndSaveIrrigationJob(zoneId: string) {
  const waitingJob = await getWaitingExecutedJob(zoneId);

  if (waitingJob) {
    return {
      skipped: false,
      waiting_for_followup: true,
      reason:
        "Recommendation blocked because the zone has an executed irrigation job waiting for follow-up.",
      waitingJob,
    };
  }

 const preview = await getIrrigationPreviewInput(zoneId);
 const calibration = await getCalibrationForZone(
  zoneId,
  preview.fieldRow.environment_type
);

  const { output, resolvedGrowthStage } =
    buildRecommendationFromPreview(preview, calibration);

  const jobData = buildIrrigationJobData(preview, output, resolvedGrowthStage);

  const createdJob = await prisma.$transaction(async (tx) => {
    await tx.irrigationJob.updateMany({
      where: {
        zone_id: zoneId,
        status: "PENDING",
      },
      data: {
        status: "SKIPPED",
        reasoning: "Skipped because a newer recommendation was created.",
      },
    });

    return tx.irrigationJob.create({
      data: jobData,
    });
  });

  return {
    skipped: false,
    preview,
    recommendation: output,
    jobData,
    createdJob,
  };
}


// actual gelince status = pending -> executed

export async function updatePendingJobWithActuals(
  zoneId: string,
  actualStartTime: Date,
  actualWaterAmountMl: number
) {
  const pendingJob = await prisma.irrigationJob.findFirst({
    where: {
      zone_id: zoneId,
      status: "PENDING",
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!pendingJob) {
    throw new Error("No pending irrigation job found for this zone");
  }

  const followupCheckTime = calculateFollowupTimeFromActual(actualStartTime);

  return prisma.irrigationJob.update({
    where: { job_id: pendingJob.job_id },
    data: {
      actual_start_time: actualStartTime,
      actual_water_amount_ml: actualWaterAmountMl,
      followup_check_time: followupCheckTime,
      status: "EXECUTED",
    },
  });
}


// exectued olanları + followup check time'ı gelenlere followup kaydı oluşturacak

export async function processDueFollowups() {
  const now = new Date();
  let processedCount = 0;

  const dueJobs = await prisma.irrigationJob.findMany({
    where: {
      status: "EXECUTED",
      followup_check_time: {
        lte: now,
      },
    },
    orderBy: {
      followup_check_time: "asc",
    },
  });

  for (const job of dueJobs) {
    if (!job.zone_id) continue;

    const existingFollowup = await prisma.irrigationFollowup.findFirst({
      where: {
        job_id: job.job_id,
      },
    });

    if (existingFollowup) {
      await prisma.irrigationJob.update({
        where: {
          job_id: job.job_id,
        },
        data: {
          status: "ANALYZED",
        },
      });
      continue;
    }



   if (!job.followup_check_time) {
  continue;
}

const followupReading = await getZoneAverageReadingAfter(
  job.zone_id,
  job.followup_check_time
);

if (!followupReading) {
  continue;
}

    const smAfterCheck = followupReading.sm_percent;
    const smBefore = job.current_sm ?? 0;
    const predictedSmAfterCheck = job.predicted_sm_after_check ?? 0;

    const smGain = smAfterCheck - smBefore;
    const predictionError = smAfterCheck - predictedSmAfterCheck;

    await prisma.irrigationFollowup.create({
      data: {
        job_id: job.job_id,
        zone_id: job.zone_id,
        result_reading_id: followupReading.result_reading_id,
        check_time: followupReading.check_time ?? now,
        sm_after_check: smAfterCheck,
        sm_gain: smGain,
        prediction_error: predictionError,
      },
    });

    await prisma.irrigationJob.update({
      where: {
        job_id: job.job_id,
      },
      data: {
        status: "ANALYZED",
      },
    });

    processedCount++;
  }

  return {
    processed_count: processedCount,
    due_count: dueJobs.length,
  };
}



function getMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle]!;
}


// POT KALİBRASYONU

async function getPotCalibrationForZone(zoneId: string): Promise<CalibrationResult> {
  const followups = await prisma.irrigationFollowup.findMany({
    where: {
      zone_id: zoneId,
      sm_after_check: { not: null },
      job: {
        status: "ANALYZED",
        actual_water_amount_ml: { gt: 0 },
        current_sm: { not: null },
        zone: {
           field: {
              environment_type: "pot",
           },
        },
      },
    },
    include: {
      job: true,
    },
    orderBy: {
      check_time: "desc",
    },
    take: 10,
  });

  const effectValues: number[] = [];
  const predictionErrors: number[] = [];

  for (const followup of followups) {
    const smAfter = followup.sm_after_check;
    const smBefore = followup.job.current_sm;
    const waterAmount = followup.job.actual_water_amount_ml;
    const predictionError = followup.prediction_error;

    if (
      smAfter == null ||
      smBefore == null ||
      waterAmount == null ||
      waterAmount <= 0
    ) {
      continue;
    }

    const smGain = smAfter - smBefore;

    if (smGain <= 0) {
      continue;
    }

    const smPercentPer100ml = (smGain / waterAmount) * 100;
    effectValues.push(smPercentPer100ml);

    if (predictionError != null) {
      predictionErrors.push(predictionError);
    }
  }

  if (effectValues.length < 5) {
    return {
      record_count: effectValues.length,
      learned_ml_per_sm_percent: null,
      learned_sm_percent_per_100ml: null,
      learned_sm_percent_per_10_min: null,
      median_prediction_error: 0,
    };
  }

  const learnedSmPercentPer100ml = getMedian(effectValues);

  const learnedMlPerSmPercent =
    learnedSmPercentPer100ml != null && learnedSmPercentPer100ml > 0
      ? 100 / learnedSmPercentPer100ml
      : null;

  return {
    record_count: effectValues.length,
    learned_ml_per_sm_percent: learnedMlPerSmPercent,
    learned_sm_percent_per_100ml: learnedSmPercentPer100ml,
    learned_sm_percent_per_10_min: null,
    median_prediction_error:
      predictionErrors.length > 0 ? getMedian(predictionErrors) : 0,
  };
}




// GREENHOUSE KALİBRASYONU

async function getGreenhouseCalibrationForZone(
  zoneId: string
): Promise<CalibrationResult> {
  const followups = await prisma.irrigationFollowup.findMany({
    where: {
      zone_id: zoneId,
      sm_after_check: { not: null },
      job: {
        status: "ANALYZED",
        actual_duration_min: { gt: 0 },
        current_sm: { not: null },
        zone: {
          field: {
            environment_type: "greenhouse",
          },
        },
      },
    },
    include: {
      job: true,
    },
    orderBy: {
      check_time: "desc",
    },
    take: 10,
  });

  const effectValues: number[] = [];
  const predictionErrors: number[] = [];

  for (const followup of followups) {
    const smAfter = followup.sm_after_check;
    const smBefore = followup.job.current_sm;
    const durationMin = followup.job.actual_duration_min;
    const predictionError = followup.prediction_error;

    if (
      smAfter == null ||
      smBefore == null ||
      durationMin == null ||
      durationMin <= 0
    ) {
      continue;
    }

    const smGain = smAfter - smBefore;

    if (smGain <= 0) {
      continue;
    }

    const smPercentPer10Min = (smGain / durationMin) * 10;
    effectValues.push(smPercentPer10Min);

    if (predictionError != null) {
      predictionErrors.push(predictionError);
    }
  }

  if (effectValues.length < 5) {
    return {
      record_count: effectValues.length,
      learned_ml_per_sm_percent: null,
      learned_sm_percent_per_100ml: null,
      learned_sm_percent_per_10_min: null,
      median_prediction_error: 0,
    };
  }

  return {
    record_count: effectValues.length,
    learned_ml_per_sm_percent: null,
    learned_sm_percent_per_100ml: null,
    learned_sm_percent_per_10_min: getMedian(effectValues),
    median_prediction_error:
      predictionErrors.length > 0 ? getMedian(predictionErrors) : 0,
  };
}


// environmente göre ayrılır

async function getCalibrationForZone(
  zoneId: string,
  environmentType: string | null
): Promise<CalibrationResult> {
  if (environmentType === "greenhouse") {
    return getGreenhouseCalibrationForZone(zoneId);
  }

  return getPotCalibrationForZone(zoneId);
}



// greenhouse için

function buildGreenhouseRecommendation(
  preview: Awaited<ReturnType<typeof getIrrigationPreviewInput>>,
  calibration: CalibrationResult,
  resolvedGrowthStage: string,
  recommendationTime: Date
): RecommendationOutput {
  const field = preview.fieldRow;
  const sensor = preview.sensorRow;

  const thresholds = getStageThresholds(resolvedGrowthStage);

  if (!thresholds) {
    throw new Error(`unsupported growth_stage: ${resolvedGrowthStage}`);
  }

  const greenhouseKc = getGreenhouseKc(resolvedGrowthStage);

  if (greenhouseKc == null || greenhouseKc <= 0) {
    throw new Error(`greenhouse Kc missing for growth_stage: ${resolvedGrowthStage}`);
  }

  if (
    field.irrigation_gain_mm_per_10_min == null ||
    field.irrigation_gain_mm_per_10_min <= 0
  ) {
    throw new Error(
      "Greenhouse irrigation setup missing: irrigation_gain_mm_per_10_min is required."
    );
  }

  const { rec_sm_min, rec_sm_max, critical_min, target_sm } = thresholds;

  if (sensor.sm_percent == null) {
    throw new Error("sm_percent missing");
  }

  if (sensor.temperature == null) {
    throw new Error("temperature missing");
  }

  if (sensor.humidity == null) {
    throw new Error("humidity missing");
  }

  if (sensor.sm_percent >= rec_sm_max) {
    return {
      should_irrigate: false,
      start_time: null,
      irrigation_mode: field.irrigation_mode,
      water_amount_ml: 0,
      recommended_duration_min: null,
      required_water_mm: 0,
      predicted_sm_after_check: sensor.sm_percent,
      recommended_check_after_min: null,
      followup_check_time: null,
      urgency_level: "low",
      reason: "Current soil moisture is already above recommended range.",
      current_sm: sensor.sm_percent,
      target_sm,
      sm_deficit: 0,
    };
  }

  const urgency = getUrgency(sensor.sm_percent, rec_sm_min, critical_min);
  const shouldIrrigate = sensor.sm_percent <= rec_sm_min;

  if (!shouldIrrigate) {
    return {
      should_irrigate: false,
      start_time: null,
      irrigation_mode: field.irrigation_mode,
      water_amount_ml: 0,
      recommended_duration_min: null,
      required_water_mm: 0,
      predicted_sm_after_check: sensor.sm_percent,
      recommended_check_after_min: null,
      followup_check_time: null,
      urgency_level: urgency,
      reason: "Soil moisture is still within acceptable range.",
      current_sm: sensor.sm_percent,
      target_sm,
      sm_deficit: 0,
    };
  }

  const estimatedEto = estimateGreenhouseEtoMmPerDay(
    sensor.temperature,
    sensor.humidity
  );

  const etc = estimatedEto * greenhouseKc;
  const baseMmFromEtc = etc / 24;

  const smDeficit = Math.max(0, target_sm - sensor.sm_percent);
  const deficitAdjustmentMm = smDeficit * 0.5;

  const requiredWaterMm = baseMmFromEtc + deficitAdjustmentMm;

  let durationMin =
    (requiredWaterMm / field.irrigation_gain_mm_per_10_min) * 10;

  durationMin = applyGreenhouseDurationLimits(durationMin);

  const learnedSmPercentPer10Min = calibration.learned_sm_percent_per_10_min;

  let predictedSmAfterCheck = sensor.sm_percent;

  if (learnedSmPercentPer10Min != null && learnedSmPercentPer10Min > 0) {
    predictedSmAfterCheck =
      sensor.sm_percent + (durationMin / 10) * learnedSmPercentPer10Min;
  }

  if (predictedSmAfterCheck > 100) predictedSmAfterCheck = 100;

  const recommendedCheckAfterMin = field.default_check_after_min ?? 60;

  return {
    should_irrigate: true,
    start_time: recommendationTime,
    irrigation_mode: field.irrigation_mode,
    water_amount_ml: 0,
    recommended_duration_min: Number(durationMin.toFixed(2)),
    required_water_mm: Number(requiredWaterMm.toFixed(2)),
    predicted_sm_after_check: Number(predictedSmAfterCheck.toFixed(2)),
    recommended_check_after_min: recommendedCheckAfterMin,
    followup_check_time: null,
    urgency_level: urgency,
    reason:
      "Irrigation is recommended based on greenhouse Kc, simplified ET0, soil moisture deficit, and irrigation duration calibration.",
    current_sm: sensor.sm_percent,
    target_sm,
    sm_deficit: Number(smDeficit.toFixed(2)),
  };
}





// Esas reccomendation function

function buildRecommendationFromPreview(
  preview: Awaited<ReturnType<typeof getIrrigationPreviewInput>>,
  calibration: CalibrationResult

): {
  output: RecommendationOutput;
  resolvedGrowthStage: string | null;
  recommendationTime: Date;
} {
  const recommendationTime = new Date();

  const field = preview.fieldRow;
  const sensor = preview.sensorRow;
  const planting = preview.plantingRow;

  if (!field.crop_name) {
    throw new Error("crop_name missing");
  }

  if (!field.environment_type) {
    throw new Error("environment_type missing");
  }

  if (!field.irrigation_mode) {
    throw new Error("irrigation_mode missing");
  }

  if (sensor.sm_percent == null) {
    throw new Error("sm_percent missing");
  }

  if (sensor.temperature == null) {
    throw new Error("temperature missing");
  }

  if (sensor.humidity == null) {
    throw new Error("humidity missing");
  }



  const resolvedGrowthStage = resolveGrowthStage(
    {
      growth_stage: planting.growth_stage,
      planting_date: planting.planting_date,
    },
    recommendationTime
  );

  if (!resolvedGrowthStage) {
    throw new Error("growth_stage cannot be determined");
  }


if (field.environment_type === "greenhouse") {
  return {
    resolvedGrowthStage,
    recommendationTime,
    output: buildGreenhouseRecommendation(
      preview,
      calibration,
      resolvedGrowthStage,
      recommendationTime
    ),
  };
}

if (field.environment_type !== "pot") {
  throw new Error(`Unsupported environment_type: ${field.environment_type}`);
}

if (field.irrigation_mode !== "manual") {
  throw new Error("Pot irrigation only supports manual irrigation mode.");
}

const thresholds = getStageThresholds(resolvedGrowthStage);



  if (!thresholds) {
    throw new Error(`unsupported growth_stage: ${resolvedGrowthStage}`);
  }

  const { rec_sm_min, rec_sm_max, critical_min, target_sm } = thresholds;

  if (sensor.sm_percent >= rec_sm_max) {
    return {
      resolvedGrowthStage,
      recommendationTime,
      output: {
        should_irrigate: false,
        start_time: null,
        irrigation_mode: field.irrigation_mode,
        water_amount_ml: 0,
        recommended_duration_min: null,
        required_water_mm: 0,
        predicted_sm_after_check: sensor.sm_percent,
        recommended_check_after_min: null,
        followup_check_time: null,
        urgency_level: "low",
        reason: "Current soil moisture is already above recommended range.",
        current_sm: sensor.sm_percent,
        target_sm,
        sm_deficit: 0,
      },
    };
  }

  const urgency = getUrgency(sensor.sm_percent, rec_sm_min, critical_min);
  const shouldIrrigate = sensor.sm_percent <= rec_sm_min;

  if (!shouldIrrigate) {
    return {
      resolvedGrowthStage,
      recommendationTime,
      output: {
        should_irrigate: false,
        start_time: null,
        irrigation_mode: field.irrigation_mode,
        water_amount_ml: 0,
        recommended_duration_min: null,
        required_water_mm: 0,
        predicted_sm_after_check: sensor.sm_percent,
        recommended_check_after_min: null,
        followup_check_time: null,
        urgency_level: urgency,
        reason: "Soil moisture is still within acceptable range.",
        current_sm: sensor.sm_percent,
        target_sm,
        sm_deficit: 0,
      },
    };
  }

  const effectiveMlPerSmPercent =
    calibration.learned_ml_per_sm_percent ?? field.ml_per_sm_percent;

  const effectiveSmPercentPer100ml =
    calibration.learned_sm_percent_per_100ml ?? field.sm_percent_per_100ml;



  if (effectiveMlPerSmPercent == null || effectiveMlPerSmPercent <= 0) {
    throw new Error("ml_per_sm_percent missing for manual pot irrigation");
  }

  if (effectiveSmPercentPer100ml == null || effectiveSmPercentPer100ml <= 0) {
    throw new Error("sm_percent_per_100ml missing for manual pot irrigation");
  }

  const smDeficit = Math.max(0, target_sm - sensor.sm_percent);

  let waterAmountMl = smDeficit * effectiveMlPerSmPercent;
  waterAmountMl = applySafetyLimits(waterAmountMl);

  const requiredWaterMm =
    field.irrigation_gain_mm_per_100ml && field.irrigation_gain_mm_per_100ml > 0
      ? (waterAmountMl / 100) * field.irrigation_gain_mm_per_100ml
      : 0;

  const predictedIncrease =(waterAmountMl / 100) * effectiveSmPercentPer100ml;
  let predictedSmAfterCheck = sensor.sm_percent + predictedIncrease;
  if (predictedSmAfterCheck > 100) predictedSmAfterCheck = 100;

  const recommendedCheckAfterMin = field.default_check_after_min ?? 60;
  

  return {
    resolvedGrowthStage,
    recommendationTime,
    output: {
      should_irrigate: true,
      start_time: recommendationTime,
      irrigation_mode: field.irrigation_mode,
      water_amount_ml: Number(waterAmountMl.toFixed(2)),
      recommended_duration_min: null,
      required_water_mm: Number(requiredWaterMm.toFixed(2)),
      predicted_sm_after_check: Number(predictedSmAfterCheck.toFixed(2)),
      recommended_check_after_min: recommendedCheckAfterMin,
      followup_check_time: null,
      urgency_level: urgency,
      reason:
        "Irrigation is recommended based on soil moisture deficit and pot calibration.",
      current_sm: sensor.sm_percent,
      target_sm,
      sm_deficit: Number(smDeficit.toFixed(2)),
    },
  };
}






// get all zones fonksiyonu

export async function getAllZoneIds() {
  const zones = await prisma.zone.findMany({
    select: {
      zone_id: true,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const uniqueZoneIds = Array.from(
    new Set(
      zones
        .map((zone) => zone.zone_id)
        .filter((zoneId): zoneId is string => zoneId !== null)
    )
  );

  return uniqueZoneIds;
}





// db'ye yazmak için

function buildIrrigationJobData(
  preview: Awaited<ReturnType<typeof getIrrigationPreviewInput>>,
  output: RecommendationOutput,
  resolvedGrowthStage: string | null
) {


  return {
    zone_id: preview.zone_id,
    trigger_reading_id:
  preview.sensorRow.id !== "zone-average"
    ? BigInt(preview.sensorRow.id)
    : null,
    reasoning: output.reason,
    should_irrigate: output.should_irrigate,
    start_time: output.start_time,
    growth_stage: resolvedGrowthStage,
    water_amount_ml: output.water_amount_ml,
    recommended_duration_min: output.recommended_duration_min,
    current_sm: output.current_sm,
    target_sm: output.target_sm,
    sm_deficit: output.sm_deficit,
    predicted_sm_after_check: output.predicted_sm_after_check,
    urgency_level: output.urgency_level,
    recommended_check_after_min: output.recommended_check_after_min,
    followup_check_time: output.followup_check_time,
    status: resolveJobStatus(output),
  };
}


// status = executed ise, o zonea analyzed olana kadar sulama önerilmez

const FOLLOWUP_WAITING_GRACE_MS = 3 * 60 * 60 * 1000;

async function getWaitingExecutedJob(zoneId: string) {
  const now = new Date();
  const graceWindowStart = new Date(now.getTime() - FOLLOWUP_WAITING_GRACE_MS);

  return prisma.irrigationJob.findFirst({
    where: {
      zone_id: zoneId,
      status: "EXECUTED",
      followup_check_time: {
        gte: graceWindowStart,
      },
      followups: {
        none: {},
      },
    },
    orderBy: {
      followup_check_time: "desc",
    },
    select: {
      job_id: true,
      followup_check_time: true,
      actual_start_time: true,
      actual_water_amount_ml: true,
    },
  });
}


// her zone için irrigation recommendation üretir

export async function generateAndSaveIrrigationJobsForAllZones() {
  const zoneIds = await getAllZoneIds();

  const successful: Array<{
    zone_id: string;
    job_id: string;
  }> = [];

  const failed: Array<{
    zone_id: string;
    error: string;
  }> = [];

  const skipped: Array<{
    zone_id: string;
    reason: string;
  }> = [];

  const waitingForFollowup: Array<{
    zone_id: string;
    reason: string;
  }> = [];

  for (const zoneId of zoneIds) {
    try {
      const result = await generateAndSaveIrrigationJob(zoneId);

      if (result.waiting_for_followup) {
        waitingForFollowup.push({
          zone_id: zoneId,
          reason: result.reason ?? "Waiting for follow-up.",
        });
        continue;
      }

      if (result.skipped) {
        skipped.push({
          zone_id: zoneId,
          reason: result.reason ?? "Skipped.",
        });
        continue;
      }

      if (result.createdJob) {
        successful.push({
          zone_id: zoneId,
          job_id: result.createdJob.job_id,
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error";

      await createFailedIrrigationJob(zoneId, errorMessage);

      failed.push({
        zone_id: zoneId,
        error: errorMessage,
      });
    }
  }

  return {
    total_zones: zoneIds.length,
    successful_count: successful.length,
    skipped_count: skipped.length,
    waiting_for_followup_count: waitingForFollowup.length,
    failed_count: failed.length,
    successful,
    skipped,
    waiting_for_followup: waitingForFollowup,
    failed,
  };
}



// failed olanları db'ye yazar

export async function createFailedIrrigationJob(
  zoneId: string,
  errorMessage: string
) {
  const now = new Date();

  return prisma.irrigationJob.create({
    data: {
      zone_id: zoneId,
      created_at: now,
      status: "FAILED",
      reasoning: errorMessage,
      should_irrigate: false,
      start_time: null,
      growth_stage: null,
      water_amount_ml: 0,
      recommended_duration_min: null,
      current_sm: null,
      target_sm: null,
      sm_deficit: 0,
      predicted_sm_after_check: null,
      urgency_level: "unknown",
      recommended_check_after_min: null,
      followup_check_time: null,
      trigger_reading_id: null,
    },
  });
}




function resolveJobStatus(output: RecommendationOutput): "PENDING" | "NO_ACTION" {
  if (!output.should_irrigate) {
    return "NO_ACTION";
  }

  return "PENDING";
}





// =======================
// FIELD JOBS LISTING / ACTUAL OUTCOME SUBMISSION
// =======================

export type FieldZoneLatestJob = {
  zone_id: string;
  zone_name: string;
  job: {
    job_id: string;
    status: string | null;
    reasoning: string | null;
    water_amount_ml: number | null;
    recommended_duration_min: number | null;
    start_time: Date | null;
    urgency_level: string | null;
  } | null;
};

export async function getLatestIrrigationJobsByField(
  fieldId: string,
  userId: string
): Promise<FieldZoneLatestJob[]> {
  const field = await prisma.field.findUnique({
    where: { field_id: fieldId },
    include: { farm: true },
  });

  if (!field || field.farm?.user_id !== userId) {
    const err = new Error("FIELD_NOT_FOUND_OR_FORBIDDEN");
    (err as any).status = 404;
    throw err;
  }

  const zones = await prisma.zone.findMany({
    where: { field_id: fieldId },
    orderBy: { created_at: "asc" },
    include: {
      jobs: {
        where: { status: { not: "FAILED" } },
        orderBy: { created_at: "desc" },
        take: 1,
        select: {
          job_id: true,
          status: true,
          reasoning: true,
          water_amount_ml: true,
	  recommended_duration_min: true,
          start_time: true,
          urgency_level: true,
        },
      },
    },
  });

  return zones.map((z) => ({
    zone_id: z.zone_id,
    zone_name: z.name,
    job: z.jobs[0] ?? null,
  }));
}


// without a recommendation

export type CreateManualIrrigationActualInput = {
  actual_start_time: Date;
  actual_water_amount_ml?: number;
  actual_duration_min?: number;
};

export type SubmitActualInput = {
  actual_water_amount_ml?: number;
  actual_start_time: Date;
  actual_duration_min?: number;
};



export async function createManualIrrigationActual(
  zoneId: string,
  userId: string,
  input: CreateManualIrrigationActualInput
) {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      field: {
        include: {
          farm: true,
        },
      },
    },
  });

  if (!zone || zone.field?.farm?.user_id !== userId) {
    const err = new Error("ZONE_NOT_FOUND_OR_FORBIDDEN");
    (err as any).status = 404;
    throw err;
  }

  const environmentType = zone.field.environment_type;
  const isPot = environmentType === "pot" || environmentType === "POT_AREA";
  const isGreenhouse = environmentType === "greenhouse" || environmentType === "GREENHOUSE";

  if (isPot) {
    if (
      input.actual_water_amount_ml == null ||
      input.actual_water_amount_ml <= 0
    ) {
      const err = new Error(
        "Pot manual irrigation requires actual_water_amount_ml."
      );
      (err as any).status = 400;
      throw err;
    }
  }

  if (isGreenhouse) {
    if (
      input.actual_duration_min == null ||
      input.actual_duration_min <= 0
    ) {
      const err = new Error(
        "Greenhouse manual irrigation requires actual_duration_min."
      );
      (err as any).status = 400;
      throw err;
    }
  }

  if (!isPot && !isGreenhouse) {
    const err = new Error(
      `Unsupported environment_type for manual irrigation actual: ${environmentType}`
    );
    (err as any).status = 400;
    throw err;
  }

  let averageReading: Awaited<ReturnType<typeof getZoneLatestAverageReading>> | null = null;
  try {
    averageReading = await getZoneLatestAverageReading(zoneId);
  } catch {
    // Zone may have no sensor nodes (e.g. pot fields with synthetic nodes).
    // Sensor data is informational for manual irrigation — proceed without it.
  }

  const followupCheckTime = calculateFollowupTimeFromActual(
    input.actual_start_time
  );

  const createdJob = await prisma.irrigationJob.create({
    data: {
      zone_id: zoneId,
      status: "EXECUTED",
      should_irrigate: true,
      reasoning: "Manual irrigation recorded without recommendation.",
      start_time: null,
      actual_start_time: input.actual_start_time,
      ...(input.actual_water_amount_ml != null
        ? { actual_water_amount_ml: input.actual_water_amount_ml }
        : {}),
      ...(input.actual_duration_min != null
        ? { actual_duration_min: input.actual_duration_min }
        : {}),
      followup_check_time: followupCheckTime,
      // Pot fields use synthetic (visual-only) nodes with no sensor_node rows in DB,
      // so getZoneLatestAverageReading may return null. current_sm is informational
      // for manual irrigation — null is safe here; the Prisma schema allows Float?.
      current_sm: averageReading?.sm_percent ?? null,
      target_sm: null,
      sm_deficit: 0,
      predicted_sm_after_check: averageReading?.sm_percent ?? null,
      recommended_check_after_min: zone.field.default_check_after_min ?? 60,
      water_amount_ml: 0,
      recommended_duration_min: null,
      urgency_level: "manual",
    },
    select: {
      job_id: true,
      zone_id: true,
      status: true,
      actual_water_amount_ml: true,
      actual_duration_min: true,
      actual_start_time: true,
      followup_check_time: true,
      current_sm: true,
      reasoning: true,
    },
  });

  return {
    job: createdJob,
    reading_summary: averageReading,
  };
}



export async function submitIrrigationJobActual(
  jobId: string,
  userId: string,
  input: SubmitActualInput
) {
  const job = await prisma.irrigationJob.findUnique({
    where: { job_id: jobId },
    include: {
      zone: {
        include: {
          field: {
            include: { farm: true },
          },
        },
      },
    },
  });

  if (!job || job.zone?.field?.farm?.user_id !== userId) {
    const err = new Error("JOB_NOT_FOUND_OR_FORBIDDEN");
    (err as any).status = 404;
    throw err;
  }

  if (job.status !== "PENDING") {
    const err = new Error(
      `Bu sulama isi artik guncellenemez. Mevcut durum: ${job.status}`
    );
    (err as any).status = 409;
    throw err;
  }





const environmentType = job.zone?.field?.environment_type;
const isPot = environmentType === "pot" || environmentType === "POT_AREA";
const isGreenhouse = environmentType === "greenhouse" || environmentType === "GREENHOUSE";

if (isPot) {
  if (
    input.actual_water_amount_ml == null ||
    input.actual_water_amount_ml <= 0
  ) {
    const err = new Error(
      "Pot irrigation requires actual_water_amount_ml."
    );
    (err as any).status = 400;
    throw err;
  }
}



if (isGreenhouse) {
  if (
    input.actual_duration_min == null ||
    input.actual_duration_min <= 0
  ) {
    const err = new Error(
      "Greenhouse irrigation requires actual_duration_min."
    );
    (err as any).status = 400;
    throw err;
  }
}

if (!isPot && !isGreenhouse) {
  const err = new Error(
    `Unsupported environment_type for irrigation actuals: ${environmentType}`
  );
  (err as any).status = 400;
  throw err;
}

// pot ise amount zorunlu
// greenhouse ise duration zorunlu



const followupCheckTime = calculateFollowupTimeFromActual(
  input.actual_start_time
);





  const updated = await prisma.irrigationJob.update({
    where: { job_id: jobId },
    data: {
  ...(input.actual_water_amount_ml != null
    ? { actual_water_amount_ml: input.actual_water_amount_ml }
    : {}),
  actual_start_time: input.actual_start_time,
  ...(input.actual_duration_min != null
    ? { actual_duration_min: input.actual_duration_min }
    : {}),
  followup_check_time: followupCheckTime,
  status: "EXECUTED",
},



    select: {
      job_id: true,
      status: true,
      actual_water_amount_ml: true,
      actual_start_time: true,
      actual_duration_min: true,
      followup_check_time: true,
    },
  });

  return updated;
}

// UUID v4-ish format dogrulamasi (Prisma'nin @db.Uuid sutununa sokmadan once)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bir zone'a ait tum sulama islerini getir (auth: zone user'a ait olmali)
export async function getZoneIrrigationJobs(zoneId: string, userId: string) {
  if (!UUID_RE.test(zoneId)) {
    const err = new Error("ZONE_NOT_FOUND_OR_FORBIDDEN");
    (err as any).status = 404;
    throw err;
  }

  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      field: {
        include: { farm: true },
      },
    },
  });

  if (!zone || zone.field?.farm?.user_id !== userId) {
    const err = new Error("ZONE_NOT_FOUND_OR_FORBIDDEN");
    (err as any).status = 404;
    throw err;
  }

  const jobs = await prisma.irrigationJob.findMany({
    where: { zone_id: zoneId, status: { not: "FAILED" } },
    orderBy: { created_at: "desc" },
    select: {
      job_id: true,
      zone_id: true,
      status: true,
      should_irrigate: true,
      water_amount_ml: true,
      recommended_duration_min: true,
      start_time: true,
      current_sm: true,
      target_sm: true,
      sm_deficit: true,
      urgency_level: true,
      reasoning: true,
      actual_water_amount_ml: true,
      actual_start_time: true,
      actual_duration_min: true,
      created_at: true,
    },
  });

  return jobs;
}

export async function testDirectPgConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const result = await client.query(
    "select zone_id, field_id, name from public.zones where zone_id = $1",
    ["0dfc9046-89dc-4ebd-837a-f9f0f5eb6ab3"]
  );

  await client.end();
  return result.rows;
}
