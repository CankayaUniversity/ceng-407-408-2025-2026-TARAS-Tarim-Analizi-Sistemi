import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { randomUUID } from "crypto";
import { DetectionStatus } from "../generated/prisma";
import { prisma } from "../config/database";
import { uploadToS3, generatePresignedDownloadUrl } from "./s3.service";
import logger from "../utils/logger";

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

const DISEASE_DETECTION_BUCKET = process.env.AWS_S3_BUCKET || "taras-images";
const LAMBDA_FUNCTION_NAME = process.env.LAMBDA_DISEASE_DETECTION_FUNCTION || "taras-disease-detection";

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
  originalFilename?: string
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

    const detection = await prisma.diseaseDetection.create({
      data: {
        user_id: userId,
        image_uuid: imageUuid,
        image_s3_key: s3Key,
        status: DetectionStatus.NOT_STARTED,
      },
    });

    logger.info(`Database record created for detection ${detection.detection_id}`, {
      detectionId: detection.detection_id,
      imageUuid,
    });

    invokeLambdaAsync(detection.detection_id, imageUuid, imageBuffer).catch((error) => {
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

async function invokeLambdaAsync(detectionId: string, imageUuid: string, imageBuffer: Buffer): Promise<void> {
  try {
    await prisma.diseaseDetection.update({
      where: { detection_id: detectionId },
      data: { status: DetectionStatus.PROCESSING, processing_started_at: new Date() },
    });

    logger.info(`Starting Lambda invocation for detection ${detectionId}`, { imageUuid });

    const payload = { image: imageBuffer.toString("base64") };
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(command);
    const responsePayload = JSON.parse(Buffer.from(response.Payload || "").toString());

    logger.info(`Lambda response received for detection ${detectionId}:`, { statusCode: responsePayload.statusCode });

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
      logger.info(`Detection ${detectionId} completed successfully`, { disease: result.disease, confidence: result.confidence });
    } else {
      const errorBody = JSON.parse(responsePayload.body);
      await prisma.diseaseDetection.update({
        where: { detection_id: detectionId },
        data: { status: DetectionStatus.FAILED, completed_at: new Date(), error_message: errorBody.error || "Unknown Lambda error" },
      });
      logger.error(`Detection ${detectionId} failed:`, errorBody);
    }
  } catch (error) {
    logger.error(`Lambda invocation error for detection ${detectionId}:`, error);
    throw error;
  }
}

export async function getUserDetections(userId: string): Promise<any[]> {
  try {
    const detections = await prisma.diseaseDetection.findMany({
      where: { user_id: userId },
      orderBy: { uploaded_at: "desc" },
      select: {
        detection_id: true,
        image_uuid: true,
        status: true,
        uploaded_at: true,
        processing_started_at: true,
        completed_at: true,
        detected_disease: true,
        confidence: true,
        confidence_score: true,
        recommendations: true,
        error_message: true,
      },
    });
    return detections;
  } catch (error) {
    logger.error(`Failed to get detections for user ${userId}:`, error);
    throw new Error(`Failed to get detection requests: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function getDetectionById(detectionId: string, userId: string): Promise<any> {
  try {
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId },
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
      where: { detection_id: detectionId, user_id: userId },
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
    const detection = await prisma.diseaseDetection.findFirst({
      where: { detection_id: detectionId, user_id: userId },
    });
    if (!detection) throw new Error("Detection not found or access denied");
    await prisma.diseaseDetection.delete({ where: { detection_id: detectionId } });
    logger.info(`Detection ${detectionId} deleted successfully`);
  } catch (error) {
    logger.error(`Failed to delete detection ${detectionId}:`, error);
    throw new Error(`Failed to delete detection: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export default {
  submitDetectionRequest,
  getUserDetections,
  getDetectionById,
  getDetectionImageUrl,
  deleteDetection,
};
