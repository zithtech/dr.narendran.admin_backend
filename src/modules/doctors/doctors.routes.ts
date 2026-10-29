import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';

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

doctorsRouter.get('/', DoctorsController.getAll);
doctorsRouter.get('/:id/locations', DoctorsController.getDoctorLocationsById);
doctorsRouter.get('/:id', DoctorsController.getById);
doctorsRouter.post('/', DoctorsController.create);
doctorsRouter.put('/:id', DoctorsController.update);
doctorsRouter.delete('/:id', DoctorsController.delete);
