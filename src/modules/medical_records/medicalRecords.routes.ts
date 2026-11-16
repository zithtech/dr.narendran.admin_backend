import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { medicalRecordsController } from './medicalRecords.controller.js';

export const medicalRecordsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
});

// Protect all routes with authentication
medicalRecordsRouter.use(requireAuth);

// Patient Dossier & Available Prescribed Tests
medicalRecordsRouter.get(
  '/patients/:patientId/dossier',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.getPatientDossier.bind(medicalRecordsController)
);

// List Records across all patients with search & filtering
medicalRecordsRouter.get(
  '/',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.listRecords.bind(medicalRecordsController)
);

// Upload a new record (prescribed lab report or external medical document)
medicalRecordsRouter.post(
  '/upload',
  requirePermission('MEDICAL_RECORDS', 'create', ['PATIENTS']),
  upload.single('file'),
  medicalRecordsController.uploadMedicalRecord.bind(medicalRecordsController)
);

// View / Stream Record Document (Inline PDF/Image preview)
medicalRecordsRouter.get(
  '/:id/file',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.viewRecord.bind(medicalRecordsController)
);
medicalRecordsRouter.get(
  '/:id/view',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.viewRecord.bind(medicalRecordsController)
);

// Single Record Details
medicalRecordsRouter.get(
  '/:id',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.getRecordById.bind(medicalRecordsController)
);

// Download Record
medicalRecordsRouter.get(
  '/:id/download',
  requirePermission('MEDICAL_RECORDS', 'read', ['PATIENTS']),
  medicalRecordsController.downloadRecord.bind(medicalRecordsController)
);

// Update Record Metadata
medicalRecordsRouter.patch(
  '/:id',
  requirePermission('MEDICAL_RECORDS', 'update', ['PATIENTS']),
  medicalRecordsController.updateMedicalRecord.bind(medicalRecordsController)
);

// Delete Record
medicalRecordsRouter.delete(
  '/:id',
  requirePermission('MEDICAL_RECORDS', 'delete', ['PATIENTS']),
  medicalRecordsController.deleteMedicalRecord.bind(medicalRecordsController)
);
