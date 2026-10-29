import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { handler } from '@/http/middleware/validate.js';

import * as reportsController from './labTestReports.controller.js';
import * as controller from './labTests.controller.js';
import { createLabTestSchema, listLabTestsSchema, updateLabTestSchema } from './labTests.schema.js';

export const labTestsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
});

const paramIdSchema = z.object({
  id: z.string().uuid()
});

labTestsRouter.use(requireAuth);

// ==========================================
// PATIENT LAB TEST REPORTS ENDPOINTS
// ==========================================
labTestsRouter.get(
  '/patient/prescribed',
  reportsController.getPatientPrescribedLabTests
);

labTestsRouter.get(
  '/patient/prescribed/:prescriptionLabTestId',
  reportsController.getPrescribedLabTestDetail
);

labTestsRouter.post(
  '/patient/prescribed/:prescriptionLabTestId/reports',
  upload.single('file'),
  reportsController.uploadPrescribedLabReport
);

// Explicit prompt path support
labTestsRouter.post(
  '/prescribed/:prescriptionLabTestId/report',
  upload.single('file'),
  reportsController.uploadPrescribedLabReport
);

labTestsRouter.post(
  '/patient/reports/external',
  upload.single('file'),
  reportsController.uploadExternalLabReport
);

labTestsRouter.delete(
  '/patient/reports/:reportId',
  reportsController.deleteReport
);

// ==========================================
// DOCTOR / GENERAL LAB TESTS ENDPOINTS
// ==========================================
labTestsRouter.get(
  '/',
  ...handler({ query: listLabTestsSchema }, controller.listLabTests)
);

labTestsRouter.get(
  '/:id',
  ...handler({ params: paramIdSchema }, controller.getLabTestById)
);

labTestsRouter.post(
  '/',
  ...handler({ body: createLabTestSchema }, controller.createLabTest)
);

labTestsRouter.put(
  '/:id',
  ...handler({ params: paramIdSchema, body: updateLabTestSchema }, controller.updateLabTest)
);

labTestsRouter.delete(
  '/:id',
  ...handler({ params: paramIdSchema }, controller.deleteLabTest)
);
