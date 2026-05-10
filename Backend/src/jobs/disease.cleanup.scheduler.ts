// Disease detection cleanup worker — sweeps two classes of orphaned S3 objects:
//
//   1. Soft-deleted thumbnails past their grace period
//        is_deleted=true AND deleted_at <= NOW - GRACE_PERIOD AND thumbnail_s3_key IS NOT NULL
//      → DELETE thumbnail from S3, NULL the column.
//      The row + image_s3_key (when consented) remain — admin/training visibility.
//      The grace window (default 7d) is a soft "undo" buffer; product UI doesn't
//      surface it, but it keeps a window in case we ever build a trash flow.
//
//   2. Originals where consent was withdrawn (or never granted) but the inline
//      enforcement path missed them
//        capture_metadata IS NOT NULL AND dataset_consent=false
//        AND status IN (COMPLETED, FAILED) AND image_s3_key IS NOT NULL
//      → DELETE original from S3, NULL image_s3_key.
//      This is a safety net for cases where enforceConsentRetention failed
//      mid-call (S3 transient error, process crash). Idempotent.
//
// Cadence: every 6 hours. Both queries use the (is_deleted, deleted_at) and
// (status, dataset_consent) indexes; both are bounded batch sizes to avoid
// long-running scans. Failures inside the sweep are logged and skipped — the
// next tick retries.

import { prisma } from "../config/database";
import { DetectionStatus, Prisma } from "../generated/prisma";
import { deleteFromS3 } from "../services/s3.service";
import logger from "../utils/logger";

if (!process.env.AWS_S3_BUCKET) throw new Error("AWS_S3_BUCKET not configured");
const DISEASE_DETECTION_BUCKET: string = process.env.AWS_S3_BUCKET;

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;     // 6 hours
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_SIZE = 50;                            // both queries

let isRunning = false;
let timer: NodeJS.Timeout | null = null;

async function sweepExpiredThumbnails(): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
  const expired = await prisma.diseaseDetection.findMany({
    where: {
      is_deleted: true,
      deleted_at: { lte: cutoff },
      thumbnail_s3_key: { not: null },
    },
    take: BATCH_SIZE,
    select: { detection_id: true, thumbnail_s3_key: true },
  });
  if (expired.length === 0) return 0;
  let cleared = 0;
  for (const row of expired) {
    if (!row.thumbnail_s3_key) continue;
    try {
      await deleteFromS3(DISEASE_DETECTION_BUCKET, row.thumbnail_s3_key);
      await prisma.diseaseDetection.update({
        where: { detection_id: row.detection_id },
        data: { thumbnail_s3_key: null },
      });
      cleared++;
    } catch (err) {
      logger.warn(
        `[CLEANUP] thumbnail sweep failed for ${row.detection_id}`,
        { err: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return cleared;
}

async function sweepOrphanedOriginals(): Promise<number> {
  const orphans = await prisma.diseaseDetection.findMany({
    where: {
      dataset_consent: false,
      capture_metadata: { not: Prisma.AnyNull },
      status: { in: [DetectionStatus.COMPLETED, DetectionStatus.FAILED] },
      image_s3_key: { not: null },
    },
    take: BATCH_SIZE,
    select: { detection_id: true, image_s3_key: true },
  });
  if (orphans.length === 0) return 0;
  let cleared = 0;
  for (const row of orphans) {
    if (!row.image_s3_key) continue;
    try {
      await deleteFromS3(DISEASE_DETECTION_BUCKET, row.image_s3_key);
      await prisma.diseaseDetection.update({
        where: { detection_id: row.detection_id },
        data: { image_s3_key: null },
      });
      cleared++;
    } catch (err) {
      logger.warn(
        `[CLEANUP] orphan original sweep failed for ${row.detection_id}`,
        { err: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return cleared;
}

async function runCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const [thumbs, origs] = await Promise.all([
      sweepExpiredThumbnails(),
      sweepOrphanedOriginals(),
    ]);
    if (thumbs > 0 || origs > 0) {
      logger.info(`[CLEANUP] swept ${thumbs} thumbnails, ${origs} orphan originals`);
    }
  } catch (err) {
    logger.error(
      `[CLEANUP] cycle failed`,
      { err: err instanceof Error ? err.message : String(err) },
    );
  } finally {
    isRunning = false;
  }
}

export function startDiseaseCleanupScheduler(): void {
  if (timer) return; // idempotent
  timer = setInterval(runCycle, POLL_INTERVAL_MS);
  // Run once at startup so any backlog from the last downtime gets cleared
  void runCycle();
  logger.info(
    `[CLEANUP] scheduler started — every ${POLL_INTERVAL_MS / 3600000}h, ` +
      `grace=${GRACE_PERIOD_MS / 86400000}d, batch=${BATCH_SIZE}`,
  );
}

export function stopDiseaseCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
