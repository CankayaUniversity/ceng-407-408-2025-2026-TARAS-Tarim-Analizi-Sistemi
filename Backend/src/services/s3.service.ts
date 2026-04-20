import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';

interface S3UploadOptions {
  bucket: string;
  key: string;
  body: Buffer | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface S3UploadResponse {
  bucket: string;
  key: string;
  url: string;
  etag?: string;
  size: number;
}

if (!process.env.AWS_REGION) throw new Error("AWS_REGION not configured");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

export async function uploadToS3(options: S3UploadOptions): Promise<S3UploadResponse> {
  const { bucket, key, body, contentType = 'application/octet-stream', metadata } = options;

  try {
    const buffer = typeof body === 'string' ? Buffer.from(body) : body;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    });

    const response = await s3Client.send(command);

    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const s3Url = await getSignedUrl(s3Client, getCommand, { expiresIn: 60 * 60 * 24 * 365 });

    logger.info(`File uploaded to S3: s3://${bucket}/${key}`, {
      etag: response.ETag,
      size: buffer.length,
    });

    return {
      bucket,
      key,
      url: s3Url,
      etag: response.ETag,
      size: buffer.length,
    };
  } catch (error) {
    logger.error('S3 upload failed:', error);
    throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generatePresignedUploadUrl(
  bucket: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    logger.info(`Presigned upload URL generated for: ${key}`, { expiresIn });
    return url;
  } catch (error) {
    logger.error('Failed to generate presigned upload URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generatePresignedDownloadUrl(
  bucket: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    logger.debug(`[S3] presign: ${key.split("/").pop()}`);
    return url;
  } catch (error) {
    logger.error('Failed to generate presigned download URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3Client.send(command);

    logger.info(`File deleted from S3: s3://${bucket}/${key}`);
  } catch (error) {
    logger.error('S3 delete failed:', error);
    throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function downloadFromS3(bucket: string, key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    const chunks: Uint8Array[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
    }

    const buffer = Buffer.concat(chunks);

    logger.info(`File downloaded from S3: s3://${bucket}/${key}`, { size: buffer.length });
    return buffer;
  } catch (error) {
    logger.error('S3 download failed:', error);
    throw new Error(`Failed to download file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export default {
  uploadToS3,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFromS3,
  downloadFromS3,
};
