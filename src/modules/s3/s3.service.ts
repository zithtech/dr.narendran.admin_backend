import type { Readable } from 'node:stream';

import { GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '@/config/env.js';

export class S3Service {
  private s3: S3;
  private bucketName: string;

  constructor() {
    this.bucketName = env.S3_BUCKET_NAME;
    this.s3 = new S3({
      region: env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Generate a pre-signed URL for uploading a file (PUT)
   */
  /**
 * Upload a Buffer directly to S3
 */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType = 'application/pdf',
  ): Promise<{ fileUrl: string; key: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.s3.send(command);
    const region = env.AWS_REGION || 'eu-north-1';
    const fileUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
    return { fileUrl, key };
  }

  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 60,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
    const region = env.AWS_REGION || 'eu-north-1';
    const fileUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key };
  }

  /**
   * Generate a pre-signed URL for reading a private file (GET)
   */
  async getReadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Stream object directly from S3
   */
  async getObjectStream(
    key: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.s3.send(command);
    return {
      stream: response.Body as Readable,
      contentType: response.ContentType ?? 'image/jpeg',
    };
  }

  /**
   * Delete an object from S3
   */
  async deleteFile(key: string): Promise<void> {
    await this.s3.deleteObject({
      Bucket: this.bucketName,
      Key: key,
    });
  }
}

export const s3Service = new S3Service();
