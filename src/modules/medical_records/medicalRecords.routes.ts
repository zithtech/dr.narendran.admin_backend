import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
import { medicalRecordsController } from './medicalRecords.controller.js';

export const medicalRecordsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
});

// Protect all routes: Require authentication and Admin or Doctor role
medicalRecordsRouter.use(requireAuth);
medicalRecordsRouter.use(requireRole('admin', 'doctor'));

// Patient Dossier & Available Prescribed Tests
medicalRecordsRouter.get(
  '/patients/:patientId/dossier',
  medicalRecordsController.getPatientDossier.bind(medicalRecordsController)
);

// List Records across all patients with search & filtering
medicalRecordsRouter.get(
  '/',
  medicalRecordsController.listRecords.bind(medicalRecordsController)
);

// Upload a new record (prescribed lab report or external medical document)
medicalRecordsRouter.post(
  '/upload',
  upload.single('file'),
  medicalRecordsController.uploadMedicalRecord.bind(medicalRecordsController)
);

// Single Record Details
medicalRecordsRouter.get(
  '/:id',
  medicalRecordsController.getRecordById.bind(medicalRecordsController)
);

// Download Record
medicalRecordsRouter.get(
  '/:id/download',
  medicalRecordsController.downloadRecord.bind(medicalRecordsController)
);

// Update Record Metadata
medicalRecordsRouter.patch(
  '/:id',
  medicalRecordsController.updateMedicalRecord.bind(medicalRecordsController)
);

// Delete Record
medicalRecordsRouter.delete(
  '/:id',
  medicalRecordsController.deleteMedicalRecord.bind(medicalRecordsController)
);
