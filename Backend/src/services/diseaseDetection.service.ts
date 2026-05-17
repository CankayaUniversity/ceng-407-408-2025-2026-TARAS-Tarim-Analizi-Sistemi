import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { randomUUID } from "crypto";
import { DetectionStatus, UserFeedback, DiseaseTarget, Prisma } from "../generated/prisma";
import { prisma } from "../config/database";
import { uploadToS3, generatePresignedDownloadUrl, deleteFromS3 } from "./s3.service";
import logger from "../utils/logger";

// Thumbnail kontrati: mobile uretir, multipart 'thumbnail' alaninda gonderir.
// Backend yeniden generate etmez (no sharp dep) — t3.small RAM'i koruyacak ve
// compressForLocalCache (Mobil/src/utils/diseaseImageProcessing.ts) ile tek
// "thumbnail nedir" tanimi paylasilir. Eksik/bos thumbnail = 400 reject.

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION,
});

if (!process.env.AWS_S3_BUCKET) throw new Error("AWS_S3_BUCKET not configured");
if (!process.env.LAMBDA_DISEASE_DETECTION_FUNCTION) throw new Error("LAMBDA_DISEASE_DETECTION_FUNCTION not configured");

const DISEASE_DETECTION_BUCKET: string = process.env.AWS_S3_BUCKET;
const LAMBDA_FUNCTION_NAME: string = process.env.LAMBDA_DISEASE_DETECTION_FUNCTION;

interface DiseaseDetectionResult {
  disease: string;
  confidence: number;
  confidence_score: number;
  all_predictions: Record<string, number>;
  recommendations: string[];
}

/**
 * Submit a new disease detection request
 * Uploads original + mobile-provided thumbnail to S3, creates DB record,
 * and triggers Lambda asynchronously
 */
export async function submitDetectionRequest(
  userId: string,
  imageBuffer: Buffer,
  thumbnailBuffer: Buffer,
  originalFilename?: string,
  folderId?: string | null,
  captureMetadata?: Record<string, unknown> | null,
): Promise<{ detectionId: string; imageUuid: string; status: DetectionStatus }> {
  try {
    const imageUuid = randomUUID();
    // Original — Standard'a gider, lifecycle policy 1 gun sonra Deep Archive'a
    // tasir. Sadece Lambda inference ve batch retraining bunu okur, mobile asla.
    const originalKey = `disease-detection/originals/${imageUuid}.jpg`;
    // Thumbnail — Standard'da kalir, mobile UI hep buraya bakar.
    const thumbnailKey = `disease-detection/thumbnails/${imageUuid}.jpg`;

    logger.info(`Starting disease detection request for user ${userId}`, {
      imageUuid,
      originalFilename,
      origSizeKB: Math.round(imageBuffer.length / 1024),
      thumbSizeKB: Math.round(thumbnailBuffer.length / 1024),
    });

    // Dual-PUT — paralel calistir, ikisi de Standard tier'a gider. Originals
    // prefix'ine atanmis lifecycle policy ileride Deep Archive'a tasir.
    await Promise.all([
      uploadToS3({
        bucket: DISEASE_DETECTION_BUCKET,
        key: originalKey,
        body: imageBuffer,
        contentType: "image/jpeg",
        metadata: {
          userId,
          imageUuid,
          tier: "original",
          originalFilename: originalFilename || "unknown",
        },
      }),
      uploadToS3({
        bucket: DISEASE_DETECTION_BUCKET,
        key: thumbnailKey,
        body: thumbnailBuffer,
        contentType: "image/jpeg",
        metadata: {
          userId,
          imageUuid,
          tier: "thumbnail",
        },
      }),
    ]);

    logger.info(`Both objects uploaded`, { imageUuid, originalKey, thumbnailKey });

    let finalFolderId: string | null = null;

    if (folderId) {
      const folder = await prisma.diseaseTrackingFolder.findFirst({
        where: {
          folder_id: folderId,
          user_id: userId,
          is_active: true,
        },
        include: {
          planting: true,
        },
      });

      if (!folder) {
        throw new Error("Tracking folder not found or inactive");
      }

      if (!folder.planting.is_active) {
        throw new Error("Planting is not active");
      }

      finalFolderId = folderId;
    }

    // User.dataset_consent is the source of truth (Settings toggle hits
    // PATCH /api/auth/me/dataset-consent → server record). The capture_metadata
    // blob's consent_dataset field is kept for client-side audit but no longer
    // trusted for retention decisions.
    const userRecord = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { dataset_consent: true },
    });
    const datasetConsent = userRecord?.dataset_consent === true;

    const detection = await prisma.diseaseDetection.create({
      data: {
        user_id: userId,
        folder_id: finalFolderId,
        image_uuid: imageUuid,
        image_s3_key: originalKey,
        thumbnail_s3_key: thumbnailKey,
        status: DetectionStatus.QUEUED,
        capture_metadata: (captureMetadata ?? undefined) as any,
        dataset_consent: datasetConsent,
      },
    });

    // Klasore eklendiyse, son aktivite zamanini guncelle (sort by recency icin)
    if (finalFolderId) {
      await prisma.diseaseTrackingFolder.update({
        where: { folder_id: finalFolderId },
        data: { last_detection_at: detection.uploaded_at },
      });
    }

    logger.info(`Database record created for detection ${detection.detection_id}`, {
      detectionId: detection.detection_id,
      imageUuid,
    });

    // Fire-and-forget. If it fails, runDetectionPipeline reverts the row to
    // QUEUED and the cron worker picks it up. Lambda reads originalKey (full
    // quality); thumbnail is for mobile UI only.
    invokeLambdaAsync(detection.detection_id, originalKey, finalFolderId).catch((error) => {
      logger.error(`[DISEASE] unexpected error scheduling pipeline for ${detection.detection_id}:`, error);
    });

    return {
      detectionId: detection.detection_id,
      imageUuid: detection.image_uuid,
      status: detection.status,
    };
  } catch (error) {
    logger.error('Failed to submit disease detection request:', error);
    throw new Error(
      `Failed to submit disease detection request: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Queue policy: Lambda is treated like an external dependency that can be
// temporarily unavailable (deploy in progress, throttled, network drop, etc.).
// Rows in QUEUED stay there until a worker picks them up; on Lambda failure
// they revert to QUEUED. The cron worker (jobs/disease.retry.scheduler.ts)
// polls every 30 sec — that interval IS the natural backoff. No max-retry
// cap; images stay queued until success or explicit bad-input (Lambda 400).
//
// Failure classification:
//   - Lambda 400 (decode failed / S3 missing / image too big) → FAILED (permanent)
//   - Lambda 500 / SDK throw / network drop / throttle         → QUEUED (re-attempted)
//
// Lease semantics: PROCESSING rows have processing_started_at set. If a worker
// crashes mid-call, the row stays in PROCESSING forever — to recover, the cron
// also picks up "stranded" PROCESSING rows where processing_started_at is older
// than ATTEMPT_LEASE_SEC.
const ATTEMPT_LEASE_SEC = 300; // 5 min — longer than worst-case Lambda cold start

/**
 * Lambda invocation pipeline (single attempt). Called both from submit
 * (fire-and-forget) and from the retry cron. Always returns; never throws.
 * Failures revert the row to QUEUED so the cron picks it up again. Permanent
 * failures (Lambda 400 = bad input) set FAILED.
 *
 * Atomic claim: only proceeds if it actually transitions an eligible row to
 * PROCESSING. Eligible = QUEUED, OR PROCESSING with stranded lease. If two
 * workers race (submit fire-and-forget vs cron tick), the loser's updateMany
 * affects 0 rows and exits silently.
 */
export async function runDetectionPipeline(
  detectionId: string,
  s3Key: string,
  folderId: string | null,
): Promise<void> {
  const now = new Date();
  const leaseExpired = new Date(now.getTime() - ATTEMPT_LEASE_SEC * 1000);

  // Atomic claim. Eligible rows:
  //   1. status = QUEUED (any age) — fresh submit or post-failure requeue
  //   2. status = PROCESSING with processing_started_at < NOW - 5min — stranded
  //      (worker died mid-call; recover by re-claiming)
  // Two updateMany calls so we can express the "OR" cleanly without a raw
  // query; first one matches QUEUED, second matches stranded.
  let claim = await prisma.diseaseDetection.updateMany({
    where: {
      detection_id: detectionId,
      status: DetectionStatus.QUEUED,
    },
    data: {
      status: DetectionStatus.PROCESSING,
      processing_started_at: now,
    },
  });
  if (claim.count === 0) {
    // Try strand recovery: PROCESSING with expired lease.
    claim = await prisma.diseaseDetection.updateMany({
      where: {
        detection_id: detectionId,
        status: DetectionStatus.PROCESSING,
        processing_started_at: { lt: leaseExpired },
      },
      data: { processing_started_at: now }, // refresh lease
    });
    if (claim.count === 0) {
      logger.info(`[DISEASE] ${detectionId} already claimed by another worker — skipping`);
      return;
    }
    logger.warn(`[DISEASE] ${detectionId} stranded (lease expired) — re-claimed`);
  }

  const start = Date.now();
  logger.info(`[DISEASE] Lambda cagiriliyor: ${s3Key.split("/").pop()}`);

  // Folder context varsa Lambda'ya crop adini iletir (cloud model crop_id alir);
  // yoksa Lambda UNKNOWN'a duser.
  let cropName: string | undefined;
  if (folderId) {
    const f = await prisma.diseaseTrackingFolder.findUnique({
      where: { folder_id: folderId },
      select: { planting: { select: { crop: { select: { name: true } } } } },
    });
    const dbName = f?.planting.crop?.name;
    if (dbName) {
      const mapped = CROP_NAME_TO_ID[dbName.trim()];
      if (mapped) cropName = mapped;
    }
  }

  const payload: Record<string, unknown> = {
    s3_bucket: DISEASE_DETECTION_BUCKET,
    s3_key: s3Key,
  };
  if (cropName) payload.crop = cropName;

  const command = new InvokeCommand({
    FunctionName: LAMBDA_FUNCTION_NAME,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  let responsePayload: { statusCode: number; body: string };
  try {
    const response = await lambdaClient.send(command);
    responsePayload = JSON.parse(Buffer.from(response.Payload || "").toString());
  } catch (error) {
    // Network/SDK-level failure: Lambda unavailable. Re-queue; cron picks up.
    const msg = error instanceof Error ? error.message : "Unknown invocation error";
    await requeue(detectionId, msg, Date.now() - start);
    return;
  }

  const duration = Date.now() - start;

  if (responsePayload.statusCode === 400) {
    // Permanent failure — bad input (decode failed / S3 NoSuchKey / image too big).
    // Re-firing won't help; mark FAILED and stop queuing.
    let errMessage = "Bad request";
    try {
      const errBody = JSON.parse(responsePayload.body);
      errMessage = errBody.error || errMessage;
    } catch { /* not JSON */ }
    logger.error(`[DISEASE] Lambda 400 (permanent fail, ${duration}ms): ${errMessage}`);
    await markPermanentFailure(detectionId, errMessage);
    await enforceConsentRetention(detectionId);
    return;
  }

  if (responsePayload.statusCode !== 200) {
    // 500/502/etc — Lambda had an internal issue. Re-queue; cron will pick up.
    let errMessage = "Unknown Lambda error";
    try {
      const errBody = JSON.parse(responsePayload.body);
      errMessage = errBody.error || errMessage;
    } catch { /* not JSON */ }
    logger.error(`[DISEASE] Lambda ${responsePayload.statusCode} (${duration}ms): ${errMessage}`);
    await requeue(detectionId, errMessage, duration);
    return;
  }

  const result: DiseaseDetectionResult = JSON.parse(responsePayload.body);
  await prisma.diseaseDetection.update({
    where: { detection_id: detectionId },
    data: {
      status: DetectionStatus.COMPLETED,
      completed_at: new Date(),
      detected_disease: result.disease,
      confidence: result.confidence,
      confidence_score: result.confidence_score,
      all_predictions: result.all_predictions as any,
      recommendations: result.recommendations as any,
    },
  });
  logger.info(`[DISEASE] ${result.disease} %${result.confidence} (${duration}ms)`);

  // Inference tamamlandi → consent kapilarsa orijinali simdi dusur. Thumbnail
  // dokunulmaz; mobile UI hala thumbnail uzerinden goruntuler.
  await enforceConsentRetention(detectionId);

  // Folder auto-tag (best-effort) — folder hala UNCERTAIN'se ilk emin tespit
  // disease'i belirler. recordUserFeedback() sonradan override edebilir.
  if (folderId && result.disease !== "Uncertain") {
    const mapped = DETECTED_DISEASE_TO_TARGET[result.disease];
    if (mapped) {
      const folder = await prisma.diseaseTrackingFolder.findUnique({
        where: { folder_id: folderId },
        select: { target_disease: true },
      });
      if (folder?.target_disease === "UNCERTAIN") {
        await prisma.diseaseTrackingFolder.update({
          where: { folder_id: folderId },
          data: { target_disease: mapped },
        });
        logger.info(`[FOLDER] ${folderId} target=${mapped} (auto from detection ${detectionId})`);
      }
    } else {
      logger.warn(
        `[FOLDER] ${folderId} auto-tag skipped: detected_disease "${result.disease}" not in map`,
      );
    }
  }
}

/**
 * After a row reaches a terminal state (COMPLETED or FAILED), drop the original
 * S3 object if the user did not consent to dataset retention. Thumbnail stays.
 *
 * Grandfathering: only enforced when capture_metadata is non-null. Legacy rows
 * uploaded before consent flag existed have NULL metadata and keep their
 * originals (no breaking retroactive deletion).
 */
async function enforceConsentRetention(detectionId: string): Promise<void> {
  try {
    const row = await prisma.diseaseDetection.findUnique({
      where: { detection_id: detectionId },
      select: {
        image_s3_key: true,
        dataset_consent: true,
        capture_metadata: true,
      },
    });
    if (!row || !row.image_s3_key) return;       // already dropped or never set
    if (!row.capture_metadata) return;            // legacy row, grandfathered
    if (row.dataset_consent) return;              // user opted in, keep

    // No consent → drop original. Thumbnail (Standard tier) is untouched.
    await deleteFromS3(DISEASE_DETECTION_BUCKET, row.image_s3_key);
    await prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: { image_s3_key: null },
    });
    logger.info(`[CONSENT] dropped original for ${detectionId} (no consent)`);
  } catch (err) {
    // Best-effort. The standalone cleanup cron sweeps any orphans later
    // (rows where dataset_consent=false AND image_s3_key IS NOT NULL).
    logger.warn(
      `[CONSENT] retention enforcement failed for ${detectionId}`,
      { err: err instanceof Error ? err.message : String(err) },
    );
  }
}

async function requeue(
  detectionId: string,
  errorMessage: string,
  durationMs: number,
): Promise<void> {
  // Revert to QUEUED so mobile sees "queued for processing" rather than
  // "actively processing". The cron's 30s poll interval is the natural backoff
  // between attempts. retry_count is purely informational telemetry.
  await prisma.diseaseDetection.update({
    where: { detection_id: detectionId },
    data: {
      status: DetectionStatus.QUEUED,
      retry_count: { increment: 1 },
      error_message: errorMessage, // overwrites; only the last error is kept
    },
  });
  logger.warn(`[DISEASE_QUEUE] ${detectionId} requeued (${durationMs}ms): ${errorMessage}`);
}

async function markPermanentFailure(
  detectionId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.diseaseDetection.update({
    where: { detection_id: detectionId },
    data: {
      status: DetectionStatus.FAILED,
      completed_at: new Date(),
      error_message: errorMessage,
    },
  });
}

async function invokeLambdaAsync(
  detectionId: string,
  s3Key: string,
  folderId: string | null,
): Promise<void> {
  try {
    await runDetectionPipeline(detectionId, s3Key, folderId);
  } catch (error) {
    // Backstop — runDetectionPipeline catches Lambda errors itself, so this
    // fires only on unexpected DB/Prisma failures. Re-queue so the cron
    // recovers once the DB is healthy again.
    logger.error(`[DISEASE] unexpected pipeline error for ${detectionId}:`, error);
    const msg = error instanceof Error ? error.message : "Unexpected pipeline error";
    await requeue(detectionId, msg, 0).catch((dbErr) => {
      logger.error(`[DISEASE] requeue also failed:`, dbErr);
    });
  }
}

export async function getUserDetections(userId: string): Promise<any[]> {
  try {
    const detections = await prisma.diseaseDetection.findMany({
      where: { user_id: userId, is_deleted: false },
      orderBy: { uploaded_at: "desc" },
      select: {
        detection_id: true,
        image_uuid: true,
        image_s3_key: true,
        thumbnail_s3_key: true,
        status: true,
        uploaded_at: true,
        processing_started_at: true,
        completed_at: true,
        detected_disease: true,
        confidence: true,
        confidence_score: true,
        all_predictions: true,
        recommendations: true,
        error_message: true,
        user_feedback: true,
        feedback_at: true,
      },
    });

    // Presigned URL'leri paralel olustur — thumbnail'a isaret eder. Legacy
    // satirlarda thumbnail_s3_key null olabilir (dual-storage oncesinden), o
    // durumda image_s3_key fallback'i kullan. Her ikisi de null ise (consent
    // dropladi + thumbnail trash sweep'tan gecti) URL null doner.
    const withUrls = await Promise.all(
      detections.map(async (d) => {
        const displayKey = d.thumbnail_s3_key ?? d.image_s3_key;
        let imageUrl: string | null = null;
        if (displayKey) {
          try {
            imageUrl = await generatePresignedDownloadUrl(
              DISEASE_DETECTION_BUCKET, displayKey, 3600,
            );
          } catch { /* presigned URL olusturulamadi */ }
        }
        const { image_s3_key, thumbnail_s3_key, ...rest } = d;
        return { ...rest, imageUrl };
      }),
    );

    return withUrls;
  } catch (error) {
    logger.error(`Failed to get detections for user ${userId}:`, error);
    throw new Error(`Failed to get detection requests: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function getDetectionById(detectionId: string, userId: string): Promise<any> {
  try {
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId, is_deleted: false },
    });
    if (!detection) throw new Error("Detection not found or access denied");
    return detection;
  } catch (error) {
    logger.error(`Failed to get detection ${detectionId}:`, error);
    throw error;
  }
}

export async function getDetectionImageUrl(detectionId: string, userId: string, expiresIn: number = 3600): Promise<string> {
  try {
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId, is_deleted: false },
      select: { image_s3_key: true, thumbnail_s3_key: true },
    });
    if (!detection) throw new Error("Detection not found or access denied");
    // Mobile UI thumbnail'a baglanir; original Deep Archive'a tasinmis olabilir
    // ve presign etsek de okuma 12+ saat surer. Legacy satirlarda thumb yoksa
    // image_s3_key fallback'i — eski upload'lar hala Standard'da. Her ikisi de
    // null ise (consent drop + cleanup sweep) hicbir display kaynagi yok.
    const displayKey = detection.thumbnail_s3_key ?? detection.image_s3_key;
    if (!displayKey) throw new Error("Image no longer available");
    return await generatePresignedDownloadUrl(DISEASE_DETECTION_BUCKET, displayKey, expiresIn);
  } catch (error) {
    logger.error(`Failed to get image URL for detection ${detectionId}:`, error);
    throw new Error(`Failed to get image URL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function deleteDetection(detectionId: string, userId: string): Promise<void> {
  try {
    // Soft-delete only — row marked is_deleted=true with deleted_at timestamp.
    // Thumbnail S3 object is NOT removed here; the cleanup cron sweeps it
    // after the grace period (jobs/disease.cleanup.scheduler.ts). The grace
    // window also serves as an undo safety net should we ever add a "trash"
    // recovery flow. Original (image_s3_key) is unaffected by user delete —
    // it was already kept-or-dropped based on consent at inference time.
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId, is_deleted: false },
      select: { detection_id: true },
    });
    if (!detection) throw new Error("Detection not found or access denied");

    await prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: { is_deleted: true, deleted_at: new Date() },
    });

    logger.info(`Detection ${detectionId} soft-deleted (thumbnail will be cleaned by cron after grace period)`);
  } catch (error) {
    logger.error(`Failed to delete detection ${detectionId}:`, error);
    throw new Error(`Failed to delete detection: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function createDiseaseTrackingFolder(
  userId: string,
  zoneId: string,
  name: string
): Promise<any> {
  if (!name || name.trim() === "") {
    throw new Error("Folder name is required");
  }
  // Zone'un kullanicidaki farm/field zincirine ait oldugunu dogrula + en yeni
  // aktif planting'i bul (irrigation.service.ts:174-182 ile ayni yaklasim).
  // Zone'da aktif planting yoksa hata don.
  const planting = await prisma.planting.findFirst({
    where: {
      zone_id: zoneId,
      is_active: true,
      zone: {
        field: {
          farm: {
            user_id: userId,
          },
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    include: {
      crop: true,
      zone: true,
    },
  });

  if (!planting) {
    throw new Error("Active planting not found or access denied");
  }

  try {
    const folder = await prisma.diseaseTrackingFolder.create({
      data: {
        user_id: userId,
        planting_id: planting.planting_id,
        name: name.trim(),
        is_active: true,
      },
    });
    return {
      folderId: folder.folder_id,
      name: folder.name,
      isActive: folder.is_active,
      targetDisease: folder.target_disease,
      lastDetectionAt: folder.last_detection_at,
      createdAt: folder.created_at,
      updatedAt: folder.updated_at,
      planting: {
        plantingId: planting.planting_id,
        isActive: planting.is_active,
        plantingDate: planting.planting_date,
        growthStage: planting.growth_stage,
        cropName: planting.crop?.name || null,
        zoneId: planting.zone?.zone_id || null,
        zoneName: planting.zone?.name || null,
      },
      detections: [],
    };
  } catch (error) {
    // Partial unique uq_active_folder_name_per_planting (planting_id, name) WHERE is_active=true
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Duplicate folder name for this active planting");
    }
    throw error;
  }
}

export async function getUserDiseaseTrackingFolders(userId: string): Promise<any[]> {
  const folders = await prisma.diseaseTrackingFolder.findMany({
    where: {
      user_id: userId,
      is_active: true,
    },
    orderBy: {
      created_at: "desc",
    },
    include: {
      planting: {
        include: {
          crop: true,
          zone: true,
        },
      },
      detections: {
        where: { is_deleted: false },
        orderBy: {
          uploaded_at: "desc",
        },
        select: {
          detection_id: true,
          image_uuid: true,
          status: true,
          uploaded_at: true,
          completed_at: true,
          detected_disease: true,
          confidence: true,
          confidence_score: true,
          image_s3_key: true,
          thumbnail_s3_key: true,
          error_message: true,
        },
      },
    },
  });

  return await Promise.all(
    folders.map(async (folder) => {
      const detections = await Promise.all(
        folder.detections.map(async (detection) => {
          let imageUrl: string | null = null;
          // Mobile thumbnail'a baglanir; legacy satirlarda image_s3_key fallback.
          const displayKey = detection.thumbnail_s3_key ?? detection.image_s3_key;

          if (displayKey) {
            try {
              imageUrl = await generatePresignedDownloadUrl(
                DISEASE_DETECTION_BUCKET,
                displayKey,
                3600
              );
            } catch {
              imageUrl = null;
            }
          }

          const { image_s3_key, thumbnail_s3_key, ...restDetection } = detection;

          return {
            ...restDetection,
            imageUrl,
          };
        })
      );

      return {
        folderId: folder.folder_id,
        name: folder.name,
        isActive: folder.is_active,
        targetDisease: folder.target_disease,
        lastDetectionAt: folder.last_detection_at,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        planting: {
          plantingId: folder.planting.planting_id,
          isActive: folder.planting.is_active,
          plantingDate: folder.planting.planting_date,
          growthStage: folder.planting.growth_stage,
          cropName: folder.planting.crop?.name || null,
          zoneId: folder.planting.zone?.zone_id || null,
          zoneName: folder.planting.zone?.name || null,
        },
        detections,
      };
    })
  );
}

export async function getDiseaseTrackingFolderById(
  userId: string,
  folderId: string
): Promise<any> {
  const folder = await prisma.diseaseTrackingFolder.findFirst({
    where: {
      folder_id: folderId,
      user_id: userId,
    },
    include: {
      planting: {
        include: {
          crop: true,
          zone: true,
        },
      },
      detections: {
        where: { is_deleted: false },
        orderBy: {
          uploaded_at: "desc",
        },
        select: {
          detection_id: true,
          image_uuid: true,
          status: true,
          uploaded_at: true,
          completed_at: true,
          detected_disease: true,
          confidence: true,
          confidence_score: true,
          all_predictions: true,
          recommendations: true,
          image_s3_key: true,
          thumbnail_s3_key: true,
          error_message: true,
        },
      },
    },
  });

  if (!folder) {
    throw new Error("Tracking folder not found or access denied");
  }

  const detections = await Promise.all(
    folder.detections.map(async (detection) => {
      let imageUrl: string | null = null;
      const displayKey = detection.thumbnail_s3_key ?? detection.image_s3_key;

      if (displayKey) {
        try {
          imageUrl = await generatePresignedDownloadUrl(
            DISEASE_DETECTION_BUCKET,
            displayKey,
            3600
          );
        } catch {
          imageUrl = null;
        }
      }

      const { image_s3_key, thumbnail_s3_key, ...restDetection } = detection;

      return {
        ...restDetection,
        imageUrl,
      };
    })
  );

  return {
    folderId: folder.folder_id,
    name: folder.name,
    isActive: folder.is_active,
    targetDisease: folder.target_disease,
    lastDetectionAt: folder.last_detection_at,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
    planting: {
      plantingId: folder.planting.planting_id,
      isActive: folder.planting.is_active,
      plantingDate: folder.planting.planting_date,
      growthStage: folder.planting.growth_stage,
      cropName: folder.planting.crop?.name || null,
      zoneId: folder.planting.zone?.zone_id || null,
      zoneName: folder.planting.zone?.name || null,
    },
    detections,
  };
}

export async function getDiseaseTrackingFolderHistory(
  userId: string,
  folderId: string
): Promise<any> {
  const folder = await prisma.diseaseTrackingFolder.findFirst({
    where: {
      folder_id: folderId,
      user_id: userId,
    },
    include: {
      planting: {
        include: {
          crop: true,
          zone: true,
        },
      },
      detections: {
        where: {
          status: DetectionStatus.COMPLETED,
          is_deleted: false,
        },
        orderBy: {
          uploaded_at: "asc",
        },
        select: {
          detection_id: true,
          uploaded_at: true,
          completed_at: true,
          detected_disease: true,
          confidence: true,
          confidence_score: true,
          all_predictions: true,
          recommendations: true,
        },
      },
    },
  });

  if (!folder) {
    throw new Error("Tracking folder not found or access denied");
  }

  return {
    folderId: folder.folder_id,
    name: folder.name,
    isActive: folder.is_active,
    targetDisease: folder.target_disease,
    planting: {
      plantingId: folder.planting.planting_id,
      isActive: folder.planting.is_active,
      cropName: folder.planting.crop?.name || null,
      zoneId: folder.planting.zone?.zone_id || null,
      zoneName: folder.planting.zone?.name || null,
    },
    history: folder.detections.map((detection) => ({
      detectionId: detection.detection_id,
      uploadedAt: detection.uploaded_at,
      completedAt: detection.completed_at,
      disease: detection.detected_disease,
      confidence: detection.confidence,
      confidenceScore: detection.confidence_score,
      allPredictions: detection.all_predictions,
      recommendations: detection.recommendations,
    })),
  };
}

export async function deactivateDiseaseTrackingFolder(
  userId: string,
  folderId: string
): Promise<void> {
  const folder = await prisma.diseaseTrackingFolder.findFirst({
    where: {
      folder_id: folderId,
      user_id: userId,
    },
  });

  if (!folder) {
    throw new Error("Tracking folder not found or access denied");
  }

  await prisma.diseaseTrackingFolder.update({
    where: {
      folder_id: folderId,
    },
    data: {
      is_active: false,
    },
  });
}

// DB'deki crop_detail.name (Turkce) -> Lambda v5 cloud model'in bekledigi
// English crop key (deployment_bundle/shared/labels.json::crop_to_index).
// Eslenmeyen ad -> Lambda UNKNOWN=7'ye duser; ~0.5-1pp accuracy hit.
// Step 6a: prod'da `SELECT DISTINCT name FROM crop_detail` ile dogrula.
const CROP_NAME_TO_ID: Record<string, string> = {
  Domates: "tomato",  domates: "tomato",  tomato: "tomato",
  Biber: "pepper",    biber: "pepper",    pepper: "pepper",
  Patates: "potato",  patates: "potato",  potato: "potato",
  "Mısır": "corn",    "Misir": "corn",    misir: "corn",  corn: "corn",
  "Şeftali": "peach", "Seftali": "peach", seftali: "peach", peach: "peach",
  Kiraz: "cherry",    kiraz: "cherry",    cherry: "cherry",
  Kabak: "squash",    kabak: "squash",    squash: "squash",
};

// Lambda v4 (display strings) ve v5 (lowercase snake) ciktilarini ayni map'te
// tutuyoruz; eslenmeyen string -> folder auto-update atlanir, feedback yine kaydolur.
const DETECTED_DISEASE_TO_TARGET: Record<string, DiseaseTarget> = {
  // Lambda v5 (lowercase snake)
  bacterial_spot: "BACTERIAL_SPOT",
  corn_common_rust: "CORN_COMMON_RUST",
  corn_gray_leaf_spot: "CORN_GRAY_LEAF_SPOT",
  corn_northern_leaf_blight: "CORN_NORTHERN_LEAF_BLIGHT",
  early_blight: "EARLY_BLIGHT",
  healthy: "HEALTHY",
  late_blight: "LATE_BLIGHT",
  leaf_mold: "LEAF_MOLD",
  mosaic_virus: "MOSAIC_VIRUS",
  powdery_mildew: "POWDERY_MILDEW",
  septoria_leaf_spot: "SEPTORIA_LEAF_SPOT",
  spider_mites: "SPIDER_MITES",
  target_spot: "TARGET_SPOT",
  yellow_leaf_curl_virus: "YELLOW_LEAF_CURL_VIRUS",
  // Lambda v4 display strings (production today)
  "Tomato - Late Blight": "LATE_BLIGHT",
  "Tomato - Leaf Mold": "LEAF_MOLD",
  "Tomato - Septoria Leaf Spot": "SEPTORIA_LEAF_SPOT",
  "Tomato - Spider Mites (Two-Spotted)": "SPIDER_MITES",
  "Tomato - Healthy": "HEALTHY",
  // "Tomato - Leaf Blight" → ambigu (Early/Late ayrimi yok), eslemiyoruz; folder
  // hedef hastaligi sessizce guncellenmez ama feedback yine de kaydolur.
};

export async function recordUserFeedback(
  detectionId: string,
  userId: string,
  feedback: UserFeedback,
  correction?: DiseaseTarget | null,
): Promise<void> {
  const detection = await prisma.diseaseDetection.findFirst({
    where: { detection_id: detectionId, user_id: userId, is_deleted: false },
    select: {
      detection_id: true,
      status: true,
      folder_id: true,
      detected_disease: true,
    },
  });
  if (!detection) {
    throw new Error("Detection not found or access denied");
  }
  if (detection.status !== DetectionStatus.COMPLETED) {
    throw new Error("Cannot record feedback on incomplete detection");
  }
  // Correction her feedback degerinde saklanir (varsa); ML training icin tum sinyaller degerli
  const correctionValue = correction ?? null;

  // Klasor target_disease auto-update: kullanici onayli son feedback kazanir
  // - DEFINITELY_CORRECT veya LIKELY_CORRECT → folder.target_disease = enum(detected_disease)
  // - DEFINITELY_WRONG + correction → folder.target_disease = correction
  // - Diger feedback degerleri → folder degismez
  let folderTargetUpdate: DiseaseTarget | null = null;
  if (
    detection.folder_id &&
    (feedback === "DEFINITELY_CORRECT" || feedback === "LIKELY_CORRECT") &&
    detection.detected_disease
  ) {
    const mapped = DETECTED_DISEASE_TO_TARGET[detection.detected_disease];
    if (mapped) {
      folderTargetUpdate = mapped;
    } else {
      logger.warn(
        `[FEEDBACK] cannot map detected_disease "${detection.detected_disease}" to DiseaseTarget — folder ${detection.folder_id} target_disease unchanged`,
      );
    }
  } else if (
    detection.folder_id &&
    feedback === "DEFINITELY_WRONG" &&
    correctionValue !== null
  ) {
    folderTargetUpdate = correctionValue;
  }

  // Detection feedback + opsiyonel folder.target_disease update'i atomic
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: {
        user_feedback: feedback,
        feedback_at: new Date(),
        user_correction: correctionValue,
      },
    }),
  ];
  if (folderTargetUpdate !== null && detection.folder_id) {
    ops.push(
      prisma.diseaseTrackingFolder.update({
        where: { folder_id: detection.folder_id },
        data: { target_disease: folderTargetUpdate },
      }),
    );
  }
  await prisma.$transaction(ops);

  logger.info(
    `[FEEDBACK] ${detectionId}: ${feedback}${correctionValue ? ` (correction: ${correctionValue})` : ""}` +
      (folderTargetUpdate !== null && detection.folder_id
        ? ` → folder ${detection.folder_id} target=${folderTargetUpdate}`
        : ""),
  );
}

export default {
  submitDetectionRequest,
  getUserDetections,
  getDetectionById,
  getDetectionImageUrl,
  deleteDetection,
  createDiseaseTrackingFolder,
  getUserDiseaseTrackingFolders,
  getDiseaseTrackingFolderById,
  getDiseaseTrackingFolderHistory,
  deactivateDiseaseTrackingFolder,
  recordUserFeedback,
};
