import type { Request, Response } from 'express';

import { settingsService } from './settings.service.js';

export class SettingsController {
  static async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const settings = await settingsService.getSettings(userId);
      res.status(200).json(settings);
    } catch (err: any) {
      console.error('[SettingsController.getSettings] Error:', err);
      res.status(500).json({ error: 'Failed to retrieve settings' });
    }
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { firstName, lastName } = req.body;

      if (typeof firstName !== 'string' && typeof lastName !== 'string') {
        res.status(400).json({ error: 'First name or last name is required.' });
        return;
      }

      const result = await settingsService.updateProfile(userId, {
        firstName: firstName || '',
        lastName: lastName || '',
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[SettingsController.updateProfile] Error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  static async uploadLogo(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      // Check if file was sent via multipart/form-data
      if (req.file && req.file.buffer) {
        const file = req.file;
        const result = await settingsService.uploadLogo(
          userId,
          file.buffer,
          file.originalname || 'logo.png',
          file.mimetype || 'image/png',
        );
        res.status(200).json(result);
        return;
      }

      // Check if sent via JSON base64 string
      const { logoBase64, fileName, mimeType } = req.body || {};
      if (typeof logoBase64 === 'string' && logoBase64.trim().length > 0) {
        const matches = logoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer: Buffer;
        let detectedMime = mimeType || 'image/png';

        if (matches && matches[2]) {
          detectedMime = matches[1] || detectedMime;
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(logoBase64, 'base64');
        }

        const result = await settingsService.uploadLogo(
          userId,
          buffer,
          fileName || 'logo.png',
          detectedMime,
        );
        res.status(200).json(result);
        return;
      }

      res.status(400).json({ error: 'No logo file or base64 image data provided.' });
    } catch (err: any) {
      console.error('[SettingsController.uploadLogo] Error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload logo to S3 bucket' });
    }
  }
}
