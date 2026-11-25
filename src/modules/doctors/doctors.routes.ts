import { Router } from 'express';
import multer from 'multer';

import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { uploadImage } from '@/modules/upload/upload.controller.js';

import { DoctorsController } from './doctors.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const doctorsRouter = Router();

doctorsRouter.post('/upload-image', requireAuth, upload.single('file'), uploadImage);

doctorsRouter.get('/me', requireAuth, DoctorsController.getMe);
doctorsRouter.put('/me', requireAuth, DoctorsController.updateMe);
doctorsRouter.post('/me/accept-terms', requireAuth, DoctorsController.acceptTerms);

// Doctor-Specific Locations (for logged-in Doctor)
doctorsRouter.get('/me/locations', requireAuth, DoctorsController.getLocations);
doctorsRouter.post('/me/locations', requireAuth, DoctorsController.createLocation);
doctorsRouter.put('/me/locations/:id', requireAuth, DoctorsController.updateLocation);
doctorsRouter.delete('/me/locations/:id', requireAuth, DoctorsController.deleteLocation);
doctorsRouter.put('/me/locations/:id/primary', requireAuth, DoctorsController.setPrimaryLocation);

// Admin Doctor Locations Management (Requires RBAC Permission for Location Management or Doctors)
doctorsRouter.get('/:doctorId/locations/all', requireAuth, requirePermission('LOCATIONS', 'read', ['DOCTORS']), DoctorsController.adminGetDoctorLocations);
doctorsRouter.post('/:doctorId/locations', requireAuth, requirePermission('LOCATIONS', 'create', ['DOCTORS']), DoctorsController.adminCreateDoctorLocation);
doctorsRouter.put('/:doctorId/locations/:locationId', requireAuth, requirePermission('LOCATIONS', 'update', ['DOCTORS']), DoctorsController.adminUpdateDoctorLocation);
doctorsRouter.delete('/:doctorId/locations/:locationId', requireAuth, requirePermission('LOCATIONS', 'delete', ['DOCTORS']), DoctorsController.adminDeleteDoctorLocation);
doctorsRouter.put('/:doctorId/locations/:locationId/primary', requireAuth, requirePermission('LOCATIONS', 'update', ['DOCTORS']), DoctorsController.adminSetPrimaryLocation);

// Doctor Code Settings Endpoints (Must be defined before /:id)
doctorsRouter.get(
  '/settings',
  requirePermission('DOCTORS', 'read', ['SETTINGS']),
  DoctorsController.getSettings,
);
doctorsRouter.put(
  '/settings',
  requirePermission('DOCTORS', 'update', ['SETTINGS']),
  DoctorsController.updateSettings,
);

// Doctor Catalog & Management
doctorsRouter.get(
  '/',
  requirePermission('DOCTORS', 'read', ['AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS', 'REVIEWS', 'PATIENTS', 'LOCATIONS', 'PATIENT_TIMELINES', 'MEDICAL_RECORDS']),
  DoctorsController.getAll,
);
doctorsRouter.get(
  '/:id/locations',
  requirePermission('LOCATIONS', 'read', ['DOCTORS', 'AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  DoctorsController.getDoctorLocationsById,
);
doctorsRouter.get(
  '/:id',
  requirePermission('DOCTORS', 'read', ['AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS', 'REVIEWS']),
  DoctorsController.getById,
);
doctorsRouter.post('/', requirePermission('DOCTORS', 'create'), DoctorsController.create);
doctorsRouter.put('/:id', requirePermission('DOCTORS', 'update'), DoctorsController.update);
doctorsRouter.delete('/:id', requirePermission('DOCTORS', 'delete'), DoctorsController.delete);
