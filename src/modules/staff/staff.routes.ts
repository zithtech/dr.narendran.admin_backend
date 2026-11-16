import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import * as controller from './staff.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit for staff verification documents
  },
});

export const staffRouter: Router = Router();

staffRouter.use(requireAuth);

staffRouter.get('/', requirePermission('STAFF', 'read'), controller.getAllStaff);
staffRouter.post('/', requirePermission('STAFF', 'create'), controller.createStaff);

staffRouter.get('/:id', requirePermission('STAFF', 'read'), controller.getStaffById);
staffRouter.put('/:id', requirePermission('STAFF', 'update'), controller.updateStaff);
staffRouter.patch('/:id', requirePermission('STAFF', 'update'), controller.updateStaff);
staffRouter.patch('/:id/status', requirePermission('STAFF', 'update'), controller.updateStaffStatus);
staffRouter.delete('/:id', requirePermission('STAFF', 'delete'), controller.deleteStaff);

// Document management
staffRouter.post(
  '/:id/documents',
  requirePermission('STAFF', 'write'),
  upload.single('file'),
  controller.uploadStaffDocument,
);
staffRouter.delete('/:id/documents/:docId', requirePermission('STAFF', 'delete'), controller.deleteStaffDocument);
staffRouter.get('/:id/documents/:docId/view', requirePermission('STAFF', 'read'), controller.viewStaffDocument);
staffRouter.get('/:id/documents/:docId/download', requirePermission('STAFF', 'read'), controller.downloadStaffDocument);

