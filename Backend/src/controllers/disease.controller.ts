import { Request, Response, NextFunction } from "express";
import {
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
} from "../services/diseaseDetection.service";
import { UserFeedback, DiseaseTarget } from "../generated/prisma";
import { asyncHandler } from "../middleware/error.middleware";
import logger from "../utils/logger";
import { getStringParam } from "../utils/requestHelpers";

/**
 * Submit a new disease detection request
 * POST /api/disease/submit
 * Uploads image to S3, creates DB record, triggers Lambda async
 */
export const submitDetection = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    // multer.fields(): req.files = { image: [File], thumbnail: [File] }
    const files = (req as any).files as
      | Record<string, Express.Multer.File[] | undefined>
      | undefined;
    const file = files?.image?.[0];
    const thumbFile = files?.thumbnail?.[0];

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
      return;
    }

    if (!file) {
      res.status(400).json({
        success: false,
        error: "No image file provided",
      });
      return;
    }

    if (!thumbFile) {
      // Mobile contract: client must always send thumbnail alongside original.
      // No server-side fallback (sharp removed) to keep RAM footprint small.
      res.status(400).json({
        success: false,
        error: "No thumbnail file provided",
      });
      return;
    }

    try {
      logger.info(`Submitting disease detection request for user ${userId}`, {
        filename: file.originalname,
        size: file.size,
        thumbSize: thumbFile.size,
      });

      const rawFolderId = (req.body as { folderId?: unknown }).folderId;
      const folderId: string | null =
        typeof rawFolderId === "string" && rawFolderId.trim().length > 0
          ? rawFolderId.trim()
          : null;

      // Capture metadata sidecar (device info, EXIF highlights, lighting,
      // live-scan prediction at capture time, dataset consent flag). Optional.
      const rawMeta = (req.body as { metadata?: unknown }).metadata;
      let captureMetadata: Record<string, unknown> | null = null;
      if (typeof rawMeta === "string" && rawMeta.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawMeta);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            captureMetadata = parsed as Record<string, unknown>;
          }
        } catch {
          // Sessizce yut — metadata bozuksa detection submit'i hata vermesin
          logger.warn(`Invalid capture metadata JSON from user ${userId}; ignoring`);
        }
      }

      const result = await submitDetectionRequest(
        userId,
        file.buffer,
        thumbFile.buffer,
        file.originalname,
        folderId,
        captureMetadata,
      );

      logger.info(`Detection request submitted successfully`, {
        detectionId: result.detectionId,
        imageUuid: result.imageUuid,
        userId,
      });

      res.status(202).json({
        success: true,
        message: "Disease detection request submitted successfully",
        data: {
          detectionId: result.detectionId,
          imageUuid: result.imageUuid,
          status: result.status,
          message:
            "Your request is being processed. Check status using the detectionId.",
        },
      });
    } catch (error) {
      logger.error("Failed to submit disease detection request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to submit disease detection request",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Get all disease detection requests for the authenticated user
 * GET /api/disease/requests
 */
export const getUserDetectionRequests = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
      return;
    }

    try {
      const detections = await getUserDetections(userId);

      res.status(200).json({
        success: true,
        data: {
          count: detections.length,
          detections,
        },
      });
    } catch (error) {
      logger.error(`Failed to get detection requests for user ${userId}:`, error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve detection requests",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Get a specific disease detection request by ID
 * GET /api/disease/requests/:detectionId
 */
export const getDetectionRequest = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const detectionId = getStringParam(req.params.detectionId);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: "Detection ID is required",
      });
      return;
    }

    try {
      const detection = await getDetectionById(detectionId, userId);

      res.status(200).json({
        success: true,
        data: detection,
      });
    } catch (error) {
      logger.error(`Failed to get detection ${detectionId}:`, error);

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: "Detection request not found or access denied",
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to retrieve detection request",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }
);

/**
 * Get presigned URL to view the disease detection image
 * GET /api/disease/requests/:detectionId/image
 */
export const getDetectionImage = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const detectionId = getStringParam(req.params.detectionId);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: "Detection ID is required",
      });
      return;
    }

    try {
      const imageUrl = await getDetectionImageUrl(detectionId, userId, 3600);

      res.status(200).json({
        success: true,
        data: {
          imageUrl,
          expiresIn: 3600,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
      });
    } catch (error) {
      logger.error(`Failed to get image URL for detection ${detectionId}:`, error);

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: "Detection request not found or access denied",
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to retrieve image URL",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }
);

/**
 * Delete a disease detection request
 * DELETE /api/disease/requests/:detectionId
 */
export const deleteDetectionRequest = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const detectionId = getStringParam(req.params.detectionId);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: "Detection ID is required",
      });
      return;
    }

    try {
      await deleteDetection(detectionId, userId);

      res.status(200).json({
        success: true,
        message: "Detection request deleted successfully",
      });
    } catch (error) {
      logger.error(`Failed to delete detection ${detectionId}:`, error);

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: "Detection request not found or access denied",
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to delete detection request",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }
);

const ALLOWED_FEEDBACK_VALUES: UserFeedback[] = [
  "DEFINITELY_WRONG",
  "LIKELY_WRONG",
  "UNSURE",
  "LIKELY_CORRECT",
  "DEFINITELY_CORRECT",
] as UserFeedback[];

const ALLOWED_CORRECTION_VALUES: DiseaseTarget[] = [
  "UNCERTAIN",
  "BACTERIAL_SPOT",
  "CORN_COMMON_RUST",
  "CORN_GRAY_LEAF_SPOT",
  "CORN_NORTHERN_LEAF_BLIGHT",
  "EARLY_BLIGHT",
  "HEALTHY",
  "LATE_BLIGHT",
  "LEAF_MOLD",
  "MOSAIC_VIRUS",
  "POWDERY_MILDEW",
  "SEPTORIA_LEAF_SPOT",
  "SPIDER_MITES",
  "TARGET_SPOT",
  "YELLOW_LEAF_CURL_VIRUS",
  "OTHER",
] as DiseaseTarget[];

/**
 * Record user feedback on a completed detection.
 * PUT /api/disease/requests/:detectionId/feedback
 * Body: {
 *   feedback: "DEFINITELY_WRONG" | "LIKELY_WRONG" | "UNSURE" | "LIKELY_CORRECT" | "DEFINITELY_CORRECT",
 *   correction?: DiseaseTarget   // sadece DEFINITELY_WRONG durumunda anlamli
 * }
 * Idempotent overwrite — latest feedback wins.
 */
export const recordFeedback = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const detectionId = getStringParam(req.params.detectionId);

    if (!userId) {
      res.status(401).json({ success: false, error: "User not authenticated" });
      return;
    }

    if (!detectionId) {
      res.status(400).json({ success: false, error: "Detection ID is required" });
      return;
    }

    const feedback = req.body?.feedback;
    if (!ALLOWED_FEEDBACK_VALUES.includes(feedback)) {
      res.status(400).json({
        success: false,
        error: `feedback must be one of: ${ALLOWED_FEEDBACK_VALUES.join(", ")}`,
      });
      return;
    }

    const correction = req.body?.correction;
    if (correction != null && !ALLOWED_CORRECTION_VALUES.includes(correction)) {
      res.status(400).json({
        success: false,
        error: `correction must be one of: ${ALLOWED_CORRECTION_VALUES.join(", ")}`,
      });
      return;
    }

    try {
      await recordUserFeedback(
        detectionId,
        userId,
        feedback as UserFeedback,
        correction as DiseaseTarget | undefined,
      );
      res.status(200).json({
        success: true,
        message: "Feedback recorded",
        data: { detectionId, feedback, correction: correction ?? null },
      });
    } catch (error) {
      logger.error(`Failed to record feedback for detection ${detectionId}:`, error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      if (msg.includes("not found") || msg.includes("access denied")) {
        res.status(404).json({
          success: false,
          error: "Detection request not found or access denied",
        });
      } else if (msg.includes("incomplete")) {
        res.status(409).json({
          success: false,
          error: "Cannot record feedback on incomplete detection",
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to record feedback",
          message: msg,
        });
      }
    }
  }
);

/**
 * Health check endpoint for disease detection service
 * GET /api/disease/health
 */
export const healthCheck = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        service: "disease-detection",
        status: "healthy",
        timestamp: new Date().toISOString(),
        lambdaFunction: process.env.LAMBDA_DISEASE_DETECTION_FUNCTION,
      },
    });
  }
);

// =======================
// TRACKING FOLDER CONTROLLERS
// =======================

export const createTrackingFolder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.user_id;
  const { zoneId, name } = req.body;

  if (!userId) {
    res.status(401).json({ success: false, error: "User not authenticated" });
    return;
  }

  if (!zoneId || typeof zoneId !== "string") {
    res.status(400).json({ success: false, error: "zoneId is required" });
    return;
  }

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({
      success: false,
      error: "Folder name is required",
    });
    return;
  }

  try {
    const folder = await createDiseaseTrackingFolder(userId, zoneId, name.trim());
    res.status(201).json({ success: true, data: folder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("Duplicate folder name")) {
      res.status(409).json({ success: false, error: "A folder with this name already exists for this active planting" });
    } else if (msg.includes("not found") || msg.includes("access denied")) {
      res.status(404).json({ success: false, error: "No active planting found in this zone, or access denied" });
    } else {
      logger.error(`Failed to create tracking folder for user ${userId}:`, error);
      res.status(500).json({ success: false, error: "Failed to create tracking folder", message: msg });
    }
  }
});

export const getTrackingFolders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.user_id;

  if (!userId) {
    res.status(401).json({ success: false, error: "User not authenticated" });
    return;
  }

  const folders = await getUserDiseaseTrackingFolders(userId);

  res.json({
    success: true,
    data: folders,
  });
});

export const getTrackingFolderById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.user_id;
  const folderId = getStringParam(req.params.folderId);

  if (!userId) {
    res.status(401).json({ success: false, error: "User not authenticated" });
    return;
  }

  if (!folderId) {
    res.status(400).json({
      success: false,
      error: "Folder ID is required",
    });
    return;
  }

  const folder = await getDiseaseTrackingFolderById(userId, folderId);

  res.json({
    success: true,
    data: folder,
  });
});

export const getTrackingFolderHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.user_id;
  const folderId = getStringParam(req.params.folderId);

  if (!userId) {
    res.status(401).json({ success: false, error: "User not authenticated" });
    return;
  }

  if (!folderId) {
    res.status(400).json({
      success: false,
      error: "Folder ID is required",
    });
    return;
  }

  const history = await getDiseaseTrackingFolderHistory(userId, folderId);

  res.json({
    success: true,
    data: history,
  });
});

export const deactivateTrackingFolder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.user_id;
  const folderId = getStringParam(req.params.folderId);

  if (!userId) {
    res.status(401).json({ success: false, error: "User not authenticated" });
    return;
  }

  if (!folderId) {
    res.status(400).json({
      success: false,
      error: "Folder ID is required",
    });
    return;
  }

  await deactivateDiseaseTrackingFolder(userId, folderId);

  res.json({
    success: true,
    message: "Folder deactivated",
  });
});
export default {
  submitDetection,
  getUserDetectionRequests,
  getDetectionRequest,
  getDetectionImage,
  deleteDetectionRequest,
  recordFeedback,
  healthCheck,

  createTrackingFolder,
  getTrackingFolders,
  getTrackingFolderById,
  getTrackingFolderHistory,
  deactivateTrackingFolder,
};
