import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';

import { GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '@/config/env.js';

function getContentTypeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export class S3Service {
  private s3: S3;
  private bucketName: string;
  private isR2: boolean;
  private localUploadsDir: string;

  constructor() {
    this.localUploadsDir = path.resolve(process.cwd(), 'uploads');

    // Cloudflare R2 is preferred if configured
    if (env.R2_ACCOUNT_ID || env.R2_ACCESS_KEY_ID || env.R2_ENDPOINT) {
      this.isR2 = true;
      this.bucketName = env.R2_BUCKET_NAME || env.S3_BUCKET_NAME;
      const endpoint =
        env.R2_ENDPOINT ||
        (env.R2_ACCOUNT_ID
          ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
          : undefined);
      const r2Config: ConstructorParameters<typeof S3>[0] = {
        region: 'auto',
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey:
            env.R2_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || '',
        },
      };
      if (endpoint) {
        r2Config.endpoint = endpoint;
      }
      this.s3 = new S3(r2Config);
    } else {
      this.isR2 = false;
      this.bucketName = env.S3_BUCKET_NAME;
      this.s3 = new S3({
        region: env.AWS_REGION || 'eu-north-1',
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
    }
  }

  getLocalFilePath(key: string): string {
    return path.join(this.localUploadsDir, key);
  }

  hasLocalFile(key: string): boolean {
    return fs.existsSync(this.getLocalFilePath(key));
  }

  /**
   * Upload a Buffer directly to Cloudflare R2 / AWS S3 with local disk fallback
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType = 'application/pdf',
  ): Promise<{ fileUrl: string; key: string }> {
    // 1. ALWAYS persist locally first as a guaranteed safety net
    try {
      const localPath = this.getLocalFilePath(key);
      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
      await fs.promises.writeFile(localPath, buffer);
    } catch (fsErr) {
      console.warn('[S3Service] Could not persist to local storage:', fsErr);
    }

    // 2. Attempt cloud upload to Cloudflare R2 / AWS S3
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      await this.s3.send(command);

      if (this.isR2 && env.R2_PUBLIC_URL) {
        return { fileUrl: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`, key };
      }

      const region = env.AWS_REGION || 'eu-north-1';
      const fileUrl = this.isR2
        ? `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`
        : `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;

      return { fileUrl, key };
    } catch (cloudErr: unknown) {
      const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
      console.warn(`[S3Service] Cloud storage upload skipped/failed (${msg}). Document safely stored in local uploads.`);
      return { fileUrl: `/api/staff/storage/${encodeURIComponent(key)}`, key };
    }
  }

  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 60,
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
      const region = env.AWS_REGION || 'eu-north-1';
      const fileUrl = this.isR2
        ? `https://${this.bucketName}.r2.cloudflarestorage.com/${key}`
        : `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;

      return { uploadUrl, fileUrl, key };
    } catch {
      return {
        uploadUrl: '',
        fileUrl: `/api/staff/storage/${encodeURIComponent(key)}`,
        key,
      };
    }
  }

  /**
   * Generate a pre-signed URL for reading a file (GET) or return local route
   */
  async getReadUrl(key: string, expiresIn = 3600): Promise<string> {
    if (this.hasLocalFile(key)) {
      return `/api/medical-records/storage/${encodeURIComponent(key)}`;
    }

    if (this.isR2 && env.R2_PUBLIC_URL) {
      return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      return await getSignedUrl(this.s3, command, { expiresIn });
    } catch {
      return `/api/staff/storage/${encodeURIComponent(key)}`;
    }
  }

  /**
   * Stream object from local disk or Cloudflare R2 / AWS S3
   */
  async getObjectStream(
    key: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const localPath = this.getLocalFilePath(key);
    if (fs.existsSync(localPath)) {
      return {
        stream: fs.createReadStream(localPath),
        contentType: getContentTypeFromKey(key),
      };
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.s3.send(command);
    return {
      stream: response.Body as Readable,
      contentType: response.ContentType ?? getContentTypeFromKey(key),
    };
  }

  /**
   * Delete an object from local disk and Cloudflare R2 / S3
   */
  async deleteFile(key: string): Promise<void> {
    const localPath = this.getLocalFilePath(key);
    if (fs.existsSync(localPath)) {
      try {
        await fs.promises.unlink(localPath);
      } catch (err) {
        console.warn(`[S3Service] Failed to delete local file ${localPath}:`, err);
      }
    }

    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: key,
      });
    } catch (cloudErr: unknown) {
      const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
      console.warn(`[S3Service] Cloud storage delete skipped/failed (${msg}).`);
    }
  }
}

export const s3Service = new S3Service();
