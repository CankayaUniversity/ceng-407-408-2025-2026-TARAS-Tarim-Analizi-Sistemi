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





type RecommendationOutput = {
  should_irrigate: boolean;
  start_time: Date | null;
  irrigation_mode: string | null;
  water_amount_ml: number;
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


function calculateFollowupTimeFromActual(
  actualStartTime: Date,
  minutes = 60
): Date {
  return new Date(actualStartTime.getTime() + minutes * 60 * 1000);
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
  const calibration = await getCalibrationForZone(zoneId);

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

    const node = await prisma.sensorNode.findFirst({
      where: {
        zone_id: job.zone_id,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!node) {
      continue;
    }

    if (!job.followup_check_time) {
      continue;
    }

    const resultReading = await prisma.sensorReading.findFirst({
      where: {
        node_id: node.node_id,
        created_at: {
          gte: job.followup_check_time,
        },
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!resultReading || resultReading.sm_percent == null) {
      continue;
    }

    const smAfterCheck = resultReading.sm_percent;
    const smBefore = job.current_sm ?? 0;
    const predictedSmAfterCheck = job.predicted_sm_after_check ?? 0;

    const smGain = smAfterCheck - smBefore;
    const predictionError = smAfterCheck - predictedSmAfterCheck;

    await prisma.irrigationFollowup.create({
      data: {
        job_id: job.job_id,
        zone_id: job.zone_id,
        result_reading_id: resultReading.id,
        check_time: resultReading.created_at ?? now,
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



async function getCalibrationForZone(zoneId: string): Promise<CalibrationResult> {
  const followups = await prisma.irrigationFollowup.findMany({
    where: {
      zone_id: zoneId,
      sm_after_check: { not: null },
      job: {
        status: "ANALYZED",
        actual_water_amount_ml: { gt: 0 },
        current_sm: { not: null },
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
    median_prediction_error:
      predictionErrors.length > 0 ? getMedian(predictionErrors) : 0,
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

  if (field.environment_type !== "pot") {
    throw new Error("V1 only supports pot environment");
  }

  if (field.irrigation_mode !== "manual") {
    throw new Error("V1 only supports manual irrigation");
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
    trigger_reading_id: BigInt(preview.sensorRow.id),
    reasoning: output.reason,
    should_irrigate: output.should_irrigate,
    start_time: output.start_time,
    growth_stage: resolvedGrowthStage,
    water_amount_ml: output.water_amount_ml,
    recommended_duration_min: null,
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
