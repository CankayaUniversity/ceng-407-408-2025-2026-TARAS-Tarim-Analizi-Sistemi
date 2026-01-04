import { Request, Response, NextFunction } from 'express';
import {
  submitDetectionRequest,
  getUserDetections,
  getDetectionById,
  getDetectionImageUrl,
  deleteDetection,
} from '../services/diseaseDetection.service';
import { asyncHandler } from '../middleware/error.middleware';
import logger from '../utils/logger';

/**
 * Submit a new disease detection request
 * POST /api/disease/submit
 * Uploads image to S3, creates DB record, triggers Lambda async
 */
export const submitDetection = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    const file = (req as any).file;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!file) {
      res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
      return;
    }

    try {
      logger.info(`Submitting disease detection request for user ${userId}`, {
        filename: file.originalname,
        size: file.size,
      });

      const result = await submitDetectionRequest(userId, file.buffer, file.originalname);

      logger.info(`Detection request submitted successfully`, {
        detectionId: result.detectionId,
        imageUuid: result.imageUuid,
        userId,
      });

      res.status(202).json({
        success: true,
        message: 'Disease detection request submitted successfully',
        data: {
          detectionId: result.detectionId,
          imageUuid: result.imageUuid,
          status: result.status,
          message:
            'Your request is being processed. Check status using the detectionId.',
        },
      });
    } catch (error) {
      logger.error('Failed to submit disease detection request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit disease detection request',
        message: error instanceof Error ? error.message : 'Unknown error',
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
        error: 'User not authenticated',
      });
      return;
    }

    try {
      logger.info(`Fetching detection requests for user ${userId}`);

      const detections = await getUserDetections(userId);

      logger.info(`Found ${detections.length} detection requests for user ${userId}`);

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
        error: 'Failed to retrieve detection requests',
        message: error instanceof Error ? error.message : 'Unknown error',
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
    const { detectionId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: 'Detection ID is required',
      });
      return;
    }

    try {
      logger.info(`Fetching detection ${detectionId} for user ${userId}`);

      const detection = await getDetectionById(detectionId, userId);

      logger.info(`Detection ${detectionId} retrieved successfully`);

      res.status(200).json({
        success: true,
        data: detection,
      });
    } catch (error) {
      logger.error(`Failed to get detection ${detectionId}:`, error);

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Detection request not found or access denied',
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve detection request',
          message: error instanceof Error ? error.message : 'Unknown error',
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
    const { detectionId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: 'Detection ID is required',
      });
      return;
    }

    try {
      logger.info(`Generating presigned URL for detection ${detectionId}`);

      const imageUrl = await getDetectionImageUrl(detectionId, userId, 3600); // 1 hour expiry

      logger.info(`Presigned URL generated for detection ${detectionId}`);

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

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Detection request not found or access denied',
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve image URL',
          message: error instanceof Error ? error.message : 'Unknown error',
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
    const { detectionId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    if (!detectionId) {
      res.status(400).json({
        success: false,
        error: 'Detection ID is required',
      });
      return;
    }

    try {
      logger.info(`Deleting detection ${detectionId} for user ${userId}`);

      await deleteDetection(detectionId, userId);

      logger.info(`Detection ${detectionId} deleted successfully`);

      res.status(200).json({
        success: true,
        message: 'Detection request deleted successfully',
      });
    } catch (error) {
      logger.error(`Failed to delete detection ${detectionId}:`, error);

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Detection request not found or access denied',
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to delete detection request',
          message: error instanceof Error ? error.message : 'Unknown error',
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
        service: 'disease-detection',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        lambdaFunction: process.env.LAMBDA_DISEASE_DETECTION_FUNCTION || 'taras-disease-detection',
      },
    });
  }
);

export default {
  submitDetection,
  getUserDetectionRequests,
  getDetectionRequest,
  getDetectionImage,
  deleteDetectionRequest,
  healthCheck,
};
