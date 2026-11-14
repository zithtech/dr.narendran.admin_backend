import { Router } from 'express';
import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
import { patientTimelinesController } from './patientTimelines.controller.js';

export const patientTimelinesRouter: Router = Router();

// Protect all routes with Admin authentication & role guard
patientTimelinesRouter.use(requireAuth);
patientTimelinesRouter.use(requireRole('admin'));

// Patient Listing with search and filtering
patientTimelinesRouter.get('/patients', patientTimelinesController.getPatients);

// Patient Medical Timeline & PDF
patientTimelinesRouter.get('/:patientId/pdf', patientTimelinesController.downloadPatientHistoryPdf);
patientTimelinesRouter.get('/:patientId', patientTimelinesController.getPatientTimeline);

