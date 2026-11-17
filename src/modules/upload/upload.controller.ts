import type { Request, Response } from 'express';
import { s3Service } from '@/modules/s3/s3.service.js';
import { ValidationError } from '@/http/errors.js';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
];

export async function uploadImage(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    throw new ValidationError('No image file provided for upload.');
  }

  const mime = file.mimetype.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mime) && !mime.startsWith('image/')) {
    throw new ValidationError(
      `Unsupported image format (${file.mimetype}). Allowed formats: JPG, PNG, WEBP, GIF, SVG.`
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new ValidationError('Image file size exceeds the 10MB limit.');
  }

  const rawFolder =
    (typeof req.body?.folder === 'string' ? req.body.folder : null) ||
    (typeof req.query['folder'] === 'string' ? req.query['folder'] : null) ||
    'avatars';
  const folder = rawFolder.replace(/[^a-zA-Z0-9_-]/g, '_');

  const sanitizedFileName = (file.originalname || 'image.jpg').replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );
  const storageKey = `uploads/${folder}/${Date.now()}_${sanitizedFileName}`;

  const uploadResult = await s3Service.uploadBuffer(
    storageKey,
    file.buffer,
    file.mimetype || 'image/jpeg'
  );

  res.status(200).json({
    status: 'success',
    data: {
      url: uploadResult.fileUrl,
      key: uploadResult.key,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    },
  });
}
