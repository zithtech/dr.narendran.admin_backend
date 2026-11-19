import {Router} from 'express';
import multer from 'multer';

import {requireAuth} from '@/http/middleware/authenticate.js';
import {requirePermission} from '@/http/middleware/rbac.middleware.js';
import {proxyImage} from '@/modules/proxy/proxy.controller.js';
import {uploadImage} from '@/modules/upload/upload.controller.js';

import {MedicalTimelineController} from './medicalTimeline.controller.js';
import {PatientMedicalHistoryController} from './patientMedicalHistory.controller.js';
import {PatientsController} from './patients.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const patientsRouter = Router();

// Image upload and unauthenticated proxy for patient images
patientsRouter.post('/upload-image', requireAuth, upload.single('file'), uploadImage);
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
// Patient Medical History Endpoints
patientsRouter.get(
  '/:patientId/medical-histories',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientMedicalHistoryController.getHistories,
);
patientsRouter.get(
  '/:patientId/medical-histories/latest',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientMedicalHistoryController.getLatest,
);
patientsRouter.get(
  '/:patientId/medical-histories/:historyId',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientMedicalHistoryController.getById,
);
patientsRouter.post(
  '/:patientId/medical-histories',
  requirePermission('PATIENTS', 'create', ['PRESCRIPTIONS']),
  PatientMedicalHistoryController.create,
);
patientsRouter.put(
  '/:patientId/medical-histories/:historyId',
  requirePermission('PATIENTS', 'update', ['PRESCRIPTIONS']),
  PatientMedicalHistoryController.update,
);
patientsRouter.delete(
  '/:patientId/medical-histories/:historyId',
  requirePermission('PATIENTS', 'delete'),
  PatientMedicalHistoryController.delete,
);

// Patient Medical Documents Endpoints
patientsRouter.get(
  '/:patientId/medical-documents',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientMedicalHistoryController.getDocuments,
);
patientsRouter.post(
  '/:patientId/medical-documents',
  requirePermission('PATIENTS', 'create', ['PRESCRIPTIONS']),
  upload.single('file'),
  PatientMedicalHistoryController.uploadDocument,
);
patientsRouter.delete(
  '/:patientId/medical-documents/:documentId',
  requirePermission('PATIENTS', 'delete'),
  PatientMedicalHistoryController.deleteDocument,
);

patientsRouter.get(
  '/:id',
  requirePermission('PATIENTS', 'read', ['APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS']),
  PatientsController.getById,
);
patientsRouter.post('/', requirePermission('PATIENTS', 'create'), PatientsController.create);
patientsRouter.put('/:id', requirePermission('PATIENTS', 'update'), PatientsController.update);
patientsRouter.delete('/:id', requirePermission('PATIENTS', 'delete'), PatientsController.delete);

