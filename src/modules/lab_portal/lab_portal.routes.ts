import { Router } from 'express';
import multer from 'multer';

import { labPortalController } from './lab_portal.controller.js';
import { requireLabPortalAuth } from './lab_portal.middleware.js';

export const labPortalRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Public Authentication Endpoints
labPortalRouter.post('/auth/login', labPortalController.login);

// Protected Lab Client Portal Endpoints
labPortalRouter.post('/auth/change-password', requireLabPortalAuth, labPortalController.changePassword);

labPortalRouter.get('/dashboard', requireLabPortalAuth, labPortalController.getDashboard);
labPortalRouter.get('/account', requireLabPortalAuth, labPortalController.getAccount);

labPortalRouter.get('/profile', requireLabPortalAuth, labPortalController.getProfile);
labPortalRouter.put('/profile', requireLabPortalAuth, labPortalController.updateProfile);

labPortalRouter.get('/services', requireLabPortalAuth, labPortalController.getServices);
labPortalRouter.post('/services', requireLabPortalAuth, labPortalController.addService);
labPortalRouter.put('/services/:serviceId', requireLabPortalAuth, labPortalController.updateService);
labPortalRouter.delete('/services/:serviceId', requireLabPortalAuth, labPortalController.deleteService);

// Patient Lab Reports Endpoints
labPortalRouter.get('/patients/search', requireLabPortalAuth, labPortalController.searchPatients);
labPortalRouter.get('/patients/:patientId/tests-and-reports', requireLabPortalAuth, labPortalController.getPatientTestsAndReports);
labPortalRouter.post(
  '/patients/:patientId/reports',
  requireLabPortalAuth,
  upload.single('file'),
  labPortalController.uploadLabReport,
);
labPortalRouter.delete('/reports/:reportId', requireLabPortalAuth, labPortalController.deleteReport);

