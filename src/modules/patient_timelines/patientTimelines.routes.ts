import { Router } from 'express';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { patientTimelinesController } from './patientTimelines.controller.js';

export const patientTimelinesRouter: Router = Router();

// Protect all routes with authentication
patientTimelinesRouter.use(requireAuth);

// Patient Listing with search and filtering
patientTimelinesRouter.get(
  '/patients',
  requirePermission('PATIENT_TIMELINES', 'read', ['PATIENTS']),
  patientTimelinesController.getPatients
);

// Patient Medical Timeline & PDF
patientTimelinesRouter.get(
  '/:patientId/pdf',
  requirePermission('PATIENT_TIMELINES', 'read', ['PATIENTS']),
  patientTimelinesController.downloadPatientHistoryPdf
);
patientTimelinesRouter.get(
  '/:patientId',
  requirePermission('PATIENT_TIMELINES', 'read', ['PATIENTS']),
  patientTimelinesController.getPatientTimeline
);

