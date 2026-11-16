import {Router} from 'express';

import {requireAuth} from '@/http/middleware/authenticate.js';
import {requirePermission} from '@/http/middleware/rbac.middleware.js';
import {proxyImage} from '@/modules/proxy/proxy.controller.js';

import {MedicalTimelineController} from './medicalTimeline.controller.js';
import {PatientsController} from './patients.controller.js';

export const patientsRouter = Router();

// Unauthenticated proxy for patient images
patientsRouter.get('/proxy-image', proxyImage);

// Authenticated Patient Medical History, Timeline & Summary (Must be defined before /:id)
patientsRouter.get('/me/medical-history/pdf', requireAuth, MedicalTimelineController.downloadMedicalHistoryPdf);
patientsRouter.post('/me/medical-history/pdf', requireAuth, MedicalTimelineController.downloadMedicalHistoryPdf);
patientsRouter.get('/me/medical-timeline/pdf', requireAuth, MedicalTimelineController.downloadMedicalHistoryPdf);
patientsRouter.post('/me/medical-timeline/pdf', requireAuth, MedicalTimelineController.downloadMedicalHistoryPdf);
patientsRouter.get('/me/medical-summary/pdf', requireAuth, MedicalTimelineController.downloadSecondOpinionPdf);
patientsRouter.post('/me/medical-summary/pdf', requireAuth, MedicalTimelineController.downloadSecondOpinionPdf);
patientsRouter.get('/me/medical-history', requireAuth, MedicalTimelineController.getMedicalHistory);
patientsRouter.get('/me/medical-timeline', requireAuth, MedicalTimelineController.getMedicalTimeline);
patientsRouter.get('/me/medical-summary', requireAuth, MedicalTimelineController.getMedicalSummary);
patientsRouter.post('/me/medical-summary', requireAuth, MedicalTimelineController.getMedicalSummary);

patientsRouter.get(
  '/',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientsController.getAll,
);
patientsRouter.post('/', requirePermission('PATIENTS', 'create'), PatientsController.create);
patientsRouter.put('/:id', requirePermission('PATIENTS', 'update'), PatientsController.update);
patientsRouter.delete('/:id', requirePermission('PATIENTS', 'delete'), PatientsController.delete);

