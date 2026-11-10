import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '@/http/middleware/authenticate.js';

import * as controller from './staff.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit for staff verification documents
  },
});

export const staffRouter: Router = Router();

staffRouter.use(requireAuth);

staffRouter.get('/', controller.getAllStaff);
staffRouter.post('/', controller.createStaff);

staffRouter.get('/:id', controller.getStaffById);
staffRouter.put('/:id', controller.updateStaff);
staffRouter.patch('/:id', controller.updateStaff);
staffRouter.patch('/:id/status', controller.updateStaffStatus);
staffRouter.delete('/:id', controller.deleteStaff);

// Document management
staffRouter.post('/:id/documents', upload.single('file'), controller.uploadStaffDocument);
staffRouter.delete('/:id/documents/:docId', controller.deleteStaffDocument);
staffRouter.get('/:id/documents/:docId/view', controller.viewStaffDocument);
staffRouter.get('/:id/documents/:docId/download', controller.downloadStaffDocument);

