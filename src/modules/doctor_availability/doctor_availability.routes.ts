import {Router} from 'express';

import {DoctorAvailabilityController} from './doctor_availability.controller.js';

export const doctorAvailabilityRouter = Router();

doctorAvailabilityRouter.get(
  '/doctor/:doctorId',
  DoctorAvailabilityController.getByDoctor,
);
doctorAvailabilityRouter.post('/', DoctorAvailabilityController.create);
doctorAvailabilityRouter.put('/:id', DoctorAvailabilityController.update);
doctorAvailabilityRouter.delete('/:id', DoctorAvailabilityController.delete);
