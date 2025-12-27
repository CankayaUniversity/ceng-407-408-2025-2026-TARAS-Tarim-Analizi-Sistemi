import { Request, Response, NextFunction } from 'express';
import { uploadToS3, generatePresignedUploadUrl, generatePresignedDownloadUrl } from '../services/s3.service';
import { asyncHandler } from '../middleware/error.middleware';
import logger from '../utils/logger';

export const uploadCropImage = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { fieldId } = req.body;
    const file = (req as any).file;

    if (!fieldId) {
      res.status(400).json({ error: 'fieldId is required' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    try {
      const bucket = process.env.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('AWS_S3_BUCKET not configured');
      }

      const timestamp = Date.now();
      const key = `farm-images/${fieldId}/${timestamp}-${file.originalname}`;

      const result = await uploadToS3({
        bucket,
        key,
        body: file.buffer,
        contentType: file.mimetype,
        metadata: {
          fieldId,
          uploadedAt: new Date().toISOString(),
        },
      });

      logger.info(`Image uploaded for field ${fieldId}:`, result.url);

      res.status(200).json({
        success: true,
        data: {
          url: result.url,
          bucket: result.bucket,
          key: result.key,
          size: result.size,
          etag: result.etag,
        },
      });
    } catch (error) {
      logger.error('Image upload failed:', error);
      res.status(500).json({
        error: 'Failed to upload image',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const getPresignedUploadUrl = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { fieldId, filename } = req.body;

    if (!fieldId || !filename) {
      res.status(400).json({ error: 'fieldId and filename are required' });
      return;
    }

    try {
      const bucket = process.env.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('AWS_S3_BUCKET not configured');
      }

      const timestamp = Date.now();
      const key = `farm-images/${fieldId}/${timestamp}-${filename}`;

      const uploadUrl = await generatePresignedUploadUrl(bucket, key, 3600); // 1 hour

      logger.info(`Presigned upload URL generated for field ${fieldId}`);

      res.status(200).json({
        success: true,
        data: {
          uploadUrl,
          bucket,
          key,
          expiresIn: 3600,
        },
      });
    } catch (error) {
      logger.error('Failed to generate presigned URL:', error);
      res.status(500).json({
        error: 'Failed to generate presigned URL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const getPresignedDownloadUrl = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { bucket, key, expiresIn = '3600' } = req.query;

    if (!bucket || !key) {
      res.status(400).json({ error: 'bucket and key are required' });
      return;
    }

    try {
      const downloadUrl = await generatePresignedDownloadUrl(
        bucket as string,
        key as string,
        parseInt(expiresIn as string)
      );

      logger.info(`Presigned download URL generated for: ${key}`);

      res.status(200).json({
        success: true,
        data: {
          downloadUrl,
          expiresIn: parseInt(expiresIn as string),
        },
      });
    } catch (error) {
      logger.error('Failed to generate download URL:', error);
      res.status(500).json({
        error: 'Failed to generate download URL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const listFieldImages = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { fieldId } = req.params;

    if (!fieldId) {
      res.status(400).json({ error: 'fieldId is required' });
      return;
    }

    try {
      res.status(200).json({
        success: true,
        data: {
          fieldId,
          images: [],
        },
      });
    } catch (error) {
      logger.error('Failed to list field images:', error);
      res.status(500).json({
        error: 'Failed to list images',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default {
  uploadCropImage,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  listFieldImages,
};
