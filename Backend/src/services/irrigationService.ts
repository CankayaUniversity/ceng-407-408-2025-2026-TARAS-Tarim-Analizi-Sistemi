import { prisma } from "../config/database";

export async function calculateIrrigationRecommendation(
  zoneId: string,
  currentSmPercent: number,
  readingId: bigint,
) {
  const zone = await prisma.zone.findUnique({
    where: { zone_id: zoneId },
    include: {
      details: true,
      sensor_nodes: true,
    },
  });

  if (!zone?.details) {
    throw new Error("Zone details not configured");
  }

  const {
    target_sm_percent = 60,
    critical_sm_percent = 30,
    current_irrigation_gain = 0.015,
  } = zone.details;

  const targetSm = target_sm_percent ?? 60;
  const criticalSm = critical_sm_percent ?? 30;
  const irrigationGain = current_irrigation_gain ?? 0.015;

  const moistureDeficit = targetSm - currentSmPercent;
  const needsIrrigation = currentSmPercent < targetSm;
  const isCritical = currentSmPercent < criticalSm;

  if (!needsIrrigation) {
    return {
      shouldIrrigate: false,
      reason: `Soil moisture (${currentSmPercent.toFixed(1)}%) is at or above target (${target_sm_percent}%)`,
    };
  }

  const recommendedDurationMin = Math.round(moistureDeficit / irrigationGain);
  const estimatedVolumePerMin = 10 * (zone.sensor_nodes.length || 1);
  const recommendedVolumeLiters = recommendedDurationMin * estimatedVolumePerMin;

  const reasoning = isCritical
    ? `CRITICAL: Soil moisture (${currentSmPercent.toFixed(1)}%) below critical threshold (${criticalSm}%). Immediate irrigation required.`
    : `Soil moisture (${currentSmPercent.toFixed(1)}%) below target (${targetSm}%). Deficit: ${moistureDeficit.toFixed(1)}%.`;

  return {
    shouldIrrigate: true,
    isCritical,
    moistureDeficit,
    recommendedDurationMin,
    recommendedVolumeLiters,
    reasoning,
    zoneId,
    readingId,
  };
}

export async function autoScheduleIrrigation(zoneId: string, readingId: bigint) {
  const reading = await prisma.sensorReading.findUnique({
    where: { id: readingId },
  });

  if (!reading?.sm_percent) {
    throw new Error("Reading does not contain soil moisture data");
  }

  const recommendation = await calculateIrrigationRecommendation(
    zoneId,
    reading.sm_percent,
    readingId,
  );

  if (!recommendation.shouldIrrigate) {
    return { created: false, reason: recommendation.reason };
  }

  const pendingJob = await prisma.irrigationJob.findFirst({
    where: {
      zone_id: zoneId,
      status: "PENDING",
    },
  });

  if (pendingJob) {
    return {
      created: false,
      reason: "A pending irrigation job already exists for this zone",
      existingJob: pendingJob,
    };
  }

  const job = await prisma.irrigationJob.create({
    data: {
      zone_id: zoneId,
      trigger_reading_id: readingId,
      reasoning: recommendation.reasoning,
      recommended_duration_min: recommendation.recommendedDurationMin,
      recommended_volume_liters: recommendation.recommendedVolumeLiters,
      status: "PENDING",
    },
  });

  return { created: true, job };
}

export async function calibrateKc(
  zoneId: string,
  windowStart: Date,
  windowEnd: Date,
  et0Sum12h: number,
) {
  const zoneDetails = await prisma.zoneDetail.findUnique({
    where: { zone_id: zoneId },
  });

  if (!zoneDetails) {
    throw new Error("Zone details not found");
  }

  const oldKc = zoneDetails.current_kc || 1.0;

  const startReading = await prisma.sensorReading.findFirst({
    where: {
      node: { zone_id: zoneId },
      created_at: { lte: windowStart },
    },
    orderBy: { created_at: "desc" },
  });

  const endReading = await prisma.sensorReading.findFirst({
    where: {
      node: { zone_id: zoneId },
      created_at: { gte: windowEnd },
    },
    orderBy: { created_at: "asc" },
  });

  if (!startReading?.sm_percent || !endReading?.sm_percent) {
    throw new Error("Insufficient soil moisture data for calibration");
  }

  const smLoss12h = startReading.sm_percent - endReading.sm_percent;

  if (smLoss12h <= 0 || et0Sum12h <= 0) {
    throw new Error("Invalid data: moisture loss and ET0 must be positive");
  }

  const calculatedRatio = smLoss12h / et0Sum12h;
  const alpha = 0.3;
  const newSuggestedKc = oldKc * (1 - alpha) + calculatedRatio * alpha;

  const calibrationLog = await prisma.kcCalibrationHistory.create({
    data: {
      zone_id: zoneId,
      window_start: windowStart,
      window_end: windowEnd,
      et0_sum_12h: et0Sum12h,
      sm_loss_12h: smLoss12h,
      calculated_ratio: calculatedRatio,
      old_kc: oldKc,
      new_suggested_kc: newSuggestedKc,
      applied_to_config: false,
    },
  });

  return {
    oldKc,
    newSuggestedKc,
    smLoss12h,
    et0Sum12h,
    calculatedRatio,
    calibrationLog,
  };
}

export async function applyKcCalibration(logId: bigint) {
  const log = await prisma.kcCalibrationHistory.findUnique({
    where: { log_id: logId },
  });

  if (!log) {
    throw new Error("Calibration log not found");
  }

  if (log.applied_to_config) {
    throw new Error("Calibration already applied");
  }

  await prisma.zoneDetail.update({
    where: { zone_id: log.zone_id! },
    data: {
      current_kc: log.new_suggested_kc!,
      updated_at: new Date(),
    },
  });

  await prisma.kcCalibrationHistory.update({
    where: { log_id: logId },
    data: { applied_to_config: true },
  });

  return { success: true, newKc: log.new_suggested_kc };
}

export async function calibrateIrrigationGain(jobId: string) {
  const job = await prisma.irrigationJob.findUnique({
    where: { job_id: jobId },
    include: {
      trigger_reading: true,
      result_reading: true,
    },
  });

  if (!job?.trigger_reading?.sm_percent || !job?.result_reading?.sm_percent) {
    throw new Error('Job does not have complete before/after moisture readings');
  }

  if (!job.actual_duration_min) {
    throw new Error("Job does not have actual duration recorded");
  }

  const moistureIncrease = job.result_reading.sm_percent - job.trigger_reading.sm_percent;
  const actualGain = moistureIncrease / job.actual_duration_min;

  await prisma.irrigationJob.update({
    where: { job_id: jobId },
    data: {
      calculated_gain_outcome: actualGain,
      status: "ANALYZED",
    },
  });

  const zoneDetails = await prisma.zoneDetail.findUnique({
    where: { zone_id: job.zone_id! },
  });

  if (!zoneDetails) {
    return { actualGain, updated: false };
  }

  const oldGain = zoneDetails.current_irrigation_gain || 0.015;
  const alpha = 0.2;
  const newGain = oldGain * (1 - alpha) + actualGain * alpha;

  await prisma.zoneDetail.update({
    where: { zone_id: job.zone_id! },
    data: {
      current_irrigation_gain: newGain,
      updated_at: new Date(),
    },
  });

  return {
    actualGain,
    oldGain,
    newGain,
    moistureIncrease,
    duration: job.actual_duration_min,
    updated: true,
  };
}

export async function getZoneEfficiencyMetrics(zoneId: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const jobs = await prisma.irrigationJob.findMany({
    where: {
      zone_id: zoneId,
      created_at: { gte: since },
      status: { in: ["EXECUTED", "ANALYZED"] },
    },
    include: {
      trigger_reading: true,
      result_reading: true,
    },
  });

  const totalJobs = jobs.length;
  const totalDuration = jobs.reduce((sum, j) => sum + (j.actual_duration_min || 0), 0);
  const totalVolume = jobs.reduce((sum, j) => sum + (j.recommended_volume_liters || 0), 0);

  const analyzedJobs = jobs.filter((j) => j.calculated_gain_outcome !== null);
  const avgGain =
    analyzedJobs.length > 0
      ? analyzedJobs.reduce((sum, j) => sum + (j.calculated_gain_outcome || 0), 0) /
        analyzedJobs.length
      : 0;

  return {
    totalJobs,
    totalDuration,
    totalVolume,
    avgGain,
    analyzedJobs: analyzedJobs.length,
    periodDays: days,
  };
}

export default {
  calculateIrrigationRecommendation,
  autoScheduleIrrigation,
  calibrateKc,
  applyKcCalibration,
  calibrateIrrigationGain,
  getZoneEfficiencyMetrics,
};
