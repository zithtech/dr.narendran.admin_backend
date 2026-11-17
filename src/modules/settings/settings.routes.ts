import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '@/http/middleware/authenticate.js';

import { SettingsController } from './settings.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, SVG, WebP) are allowed.'));
    }
  },
});

export const settingsRouter = Router();

// Require authenticated session for all settings endpoints
settingsRouter.use(requireAuth);

settingsRouter.get('/', SettingsController.getSettings);
settingsRouter.get('/profile', SettingsController.getSettings);
settingsRouter.put('/profile', SettingsController.updateProfile);
settingsRouter.post('/logo', upload.single('logo'), SettingsController.uploadLogo);

