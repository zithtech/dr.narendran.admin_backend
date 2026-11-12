import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { DoctorsController } from './doctors.controller.js';

export const doctorsRouter = Router();

doctorsRouter.get('/me', requireAuth, DoctorsController.getMe);
doctorsRouter.put('/me', requireAuth, DoctorsController.updateMe);
doctorsRouter.post('/me/accept-terms', requireAuth, DoctorsController.acceptTerms);

// Locations
doctorsRouter.get('/me/locations', requireAuth, DoctorsController.getLocations);
doctorsRouter.post('/me/locations', requireAuth, DoctorsController.createLocation);
doctorsRouter.put('/me/locations/:id', requireAuth, DoctorsController.updateLocation);
doctorsRouter.delete('/me/locations/:id', requireAuth, DoctorsController.deleteLocation);
doctorsRouter.put('/me/locations/:id/primary', requireAuth, DoctorsController.setPrimaryLocation);

doctorsRouter.get(
  '/',
  requirePermission('DOCTORS', 'read', ['AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE', 'PRESCRIPTIONS', 'REVIEWS', 'PATIENTS']),
  DoctorsController.getAll,
);
doctorsRouter.get(
  '/:id/locations',
  requirePermission('DOCTORS', 'read', ['AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
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
