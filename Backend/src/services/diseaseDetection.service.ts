import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { randomUUID } from "crypto";
import { DetectionStatus, UserFeedback, DiseaseTarget, Prisma } from "../generated/prisma";
import { prisma } from "../config/database";
import { uploadToS3, generatePresignedDownloadUrl } from "./s3.service";
import logger from "../utils/logger";

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
 * Uploads image to S3, creates DB record, and triggers Lambda asynchronously
 */
export async function submitDetectionRequest(
  userId: string,
  imageBuffer: Buffer,
  originalFilename?: string,
  folderId?: string | null
): Promise<{ detectionId: string; imageUuid: string; status: DetectionStatus }> {
  try {
    const imageUuid = randomUUID();
    const fileExtension = originalFilename?.split(".").pop() || "jpg";
    const s3Key = `disease-detection/${imageUuid}.${fileExtension}`;

    logger.info(`Starting disease detection request for user ${userId}`, {
      imageUuid,
      originalFilename,
    });

    await uploadToS3({
      bucket: DISEASE_DETECTION_BUCKET,
      key: s3Key,
      body: imageBuffer,
      contentType: `image/${fileExtension}`,
      metadata: {
        userId,
        imageUuid,
        originalFilename: originalFilename || 'unknown',
      },
    });

    logger.info(`Image uploaded to S3: ${s3Key}`, { imageUuid });

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

    const detection = await prisma.diseaseDetection.create({
      data: {
        user_id: userId,
        folder_id: finalFolderId,
        image_uuid: imageUuid,
        image_s3_key: s3Key,
        status: DetectionStatus.NOT_STARTED,
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

    invokeLambdaAsync(detection.detection_id, s3Key).catch((error) => {
      logger.error(`Async Lambda invocation failed for detection ${detection.detection_id}:`, error);
      // Update status to FAILED
      prisma.diseaseDetection
        .update({
          where: { detection_id: detection.detection_id },
          data: {
            status: DetectionStatus.FAILED,
            error_message: `Lambda invocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        })
        .catch((dbError) => {
          logger.error(`Failed to update detection status to FAILED:`, dbError);
        });
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

async function invokeLambdaAsync(detectionId: string, s3Key: string): Promise<void> {
  try {
    await prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: { status: DetectionStatus.PROCESSING, processing_started_at: new Date() },
    });

    const start = Date.now();
    logger.info(`[DISEASE] Lambda cagiriliyor: ${s3Key.split("/").pop()}`);

    // S3 key gonder — Lambda goruntuyu S3'ten okur (6MB payload limitini onler)
    const payload = { s3_bucket: DISEASE_DETECTION_BUCKET, s3_key: s3Key };
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(command);
    const responsePayload = JSON.parse(Buffer.from(response.Payload || "").toString());
    const duration = Date.now() - start;

    if (responsePayload.statusCode === 200) {
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
    } else {
      const errorBody = JSON.parse(responsePayload.body);
      await prisma.diseaseDetection.update({
        where: { detection_id: detectionId },
        data: { status: DetectionStatus.FAILED, completed_at: new Date(), error_message: errorBody.error || "Unknown Lambda error" },
      });
      logger.error(`[DISEASE] Lambda hata (${duration}ms):`, errorBody);
    }
  } catch (error) {
    logger.error(`Lambda invocation error for detection ${detectionId}:`, error);
    throw error;
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

    // Presigned URL'leri paralel olustur
    const withUrls = await Promise.all(
      detections.map(async (d) => {
        let imageUrl: string | null = null;
        try {
          imageUrl = await generatePresignedDownloadUrl(
            DISEASE_DETECTION_BUCKET, d.image_s3_key, 3600,
          );
        } catch { /* presigned URL olusturulamadi */ }
        const { image_s3_key, ...rest } = d;
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
      select: { image_s3_key: true },
    });
    if (!detection) throw new Error("Detection not found or access denied");
    return await generatePresignedDownloadUrl(DISEASE_DETECTION_BUCKET, detection.image_s3_key, expiresIn);
  } catch (error) {
    logger.error(`Failed to get image URL for detection ${detectionId}:`, error);
    throw new Error(`Failed to get image URL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function deleteDetection(detectionId: string, userId: string): Promise<void> {
  try {
    // Soft delete — image + row preserved for ML training; hidden from user-facing GETs
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId, is_deleted: false },
      select: { detection_id: true },
    });
    if (!detection) throw new Error("Detection not found or access denied");
    await prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: { is_deleted: true },
    });
    logger.info(`Detection ${detectionId} soft-deleted (image preserved for ML training)`);
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
    return await prisma.diseaseTrackingFolder.create({
      data: {
        user_id: userId,
        planting_id: planting.planting_id,
        name: name.trim(),
        is_active: true,
      },
    });
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

          try {
            imageUrl = await generatePresignedDownloadUrl(
              DISEASE_DETECTION_BUCKET,
              detection.image_s3_key,
              3600
            );
          } catch {
            imageUrl = null;
          }

          const { image_s3_key, ...restDetection } = detection;

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

      try {
        imageUrl = await generatePresignedDownloadUrl(
          DISEASE_DETECTION_BUCKET,
          detection.image_s3_key,
          3600
        );
      } catch {
        imageUrl = null;
      }

      const { image_s3_key, ...restDetection } = detection;

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

// Lambda detected_disease string (lowercase snake) → DiseaseTarget enum.
// Mirrors ML/configs/label_map.py::CLASS_NAMES exactly. If the Lambda ever
// returns "Uncertain" or any string outside this map, the lookup returns
// undefined and recordUserFeedback throws (per design 2026-04-30).
const DETECTED_DISEASE_TO_TARGET: Record<string, DiseaseTarget> = {
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
    if (!mapped) {
      throw new Error(
        `Cannot record feedback: detected disease "${detection.detected_disease}" does not map to a known DiseaseTarget`,
      );
    }
    folderTargetUpdate = mapped;
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
