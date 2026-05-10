// Disease detection queue worker — picks up QUEUED rows (and stranded
// PROCESSING rows whose worker died) and re-fires the Lambda invocation
// pipeline. Lambda failures (5xx / network / throttle) revert the row back to
// QUEUED for another tick. Permanent failures (Lambda 400) set FAILED.
// There is NO max-retry cap — images stay queued until the service recovers.
//
// Crash recovery: a stranded row is one in PROCESSING whose
// processing_started_at is older than ATTEMPT_LEASE_SEC (5 min).
//
// Cron cadence: every 30 sec via setInterval. The poll interval IS the
// natural backoff — when Lambda fails, the row goes back to QUEUED and gets
// another attempt on the next tick.

import { prisma } from "../config/database";
import { runDetectionPipeline } from "../services/diseaseDetection.service";
import { DetectionStatus } from "../generated/prisma";
import logger from "../utils/logger";

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 5;
const STRANDED_THRESHOLD_SEC = 300; // matches ATTEMPT_LEASE_SEC in service

let isRunning = false;
let timer: NodeJS.Timeout | null = null;

async function pickAndRun(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const stranded = new Date(Date.now() - STRANDED_THRESHOLD_SEC * 1000);
    // Eligible:
    //   - QUEUED (oldest first, FIFO ordering)
    //   - PROCESSING with processing_started_at < (NOW - 5min) — stranded
    const due = await prisma.diseaseDetection.findMany({
      where: {
        // image_s3_key NULL = consent-dropped or never set; never invoke Lambda.
        // Such rows can only be in terminal states, but exclude defensively.
        image_s3_key: { not: null },
        OR: [
          { status: DetectionStatus.QUEUED },
          {
            status: DetectionStatus.PROCESSING,
            processing_started_at: { lt: stranded },
          },
        ],
      },
      orderBy: { uploaded_at: "asc" },
      take: BATCH_SIZE,
      select: {
        detection_id: true,
        image_s3_key: true,
        folder_id: true,
        status: true,
        retry_count: true,
      },
    });
    if (due.length === 0) return;
    logger.info(`[DISEASE_QUEUE] picking up ${due.length} due rows`);
    for (const row of due) {
      // Belt-and-suspenders against the schema's nullability — WHERE filter
      // above ensures non-null, but TS can't track that across Prisma.
      if (!row.image_s3_key) continue;
      try {
        await runDetectionPipeline(row.detection_id, row.image_s3_key, row.folder_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[DISEASE_QUEUE] runDetectionPipeline crashed for ${row.detection_id}: ${msg}`);
        // runDetectionPipeline already handles its own failures; the catch is
        // a backstop for unexpected throws (e.g. Prisma connection lost mid-call).
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[DISEASE_QUEUE] cycle failed: ${msg}`);
  } finally {
    isRunning = false;
  }
}

export function startDiseaseRetryScheduler(): void {
  if (timer) return; // idempotent
  timer = setInterval(pickAndRun, POLL_INTERVAL_MS);
  // Initial tick on startup so any rows queued during downtime are picked up immediately
  void pickAndRun();
  logger.info(`[DISEASE_QUEUE] scheduler started — polling every ${POLL_INTERVAL_MS / 1000}s, batch=${BATCH_SIZE}`);
}

export function stopDiseaseRetryScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
