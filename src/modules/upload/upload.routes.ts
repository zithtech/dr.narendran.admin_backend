import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '@/http/middleware/authenticate.js';
import * as controller from './upload.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export const uploadRouter: Router = Router();

uploadRouter.post(
  '/image',
  requireAuth,
  upload.single('file'),
  controller.uploadImage
);
