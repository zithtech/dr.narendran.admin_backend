import {Router} from 'express';

import {requirePermission} from '@/http/middleware/rbac.middleware.js';

import {DoctorAvailabilityController} from './doctor_availability.controller.js';

export const doctorAvailabilityRouter = Router();

doctorAvailabilityRouter.get(
  '/',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  DoctorAvailabilityController.getAll,
);
doctorAvailabilityRouter.get(
  '/doctor/:doctorId',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  DoctorAvailabilityController.getByDoctor,
);
doctorAvailabilityRouter.put(
  '/doctor/:doctorId/slot-length',
  requirePermission('AVAILABILITY', 'update'),
  DoctorAvailabilityController.updateDoctorSlotLength,
);
doctorAvailabilityRouter.get(
  '/doctor/:doctorId/blocked-dates',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  DoctorAvailabilityController.getBlockedDates,
);
doctorAvailabilityRouter.post(
  '/doctor/:doctorId/blocked-dates',
  requirePermission('AVAILABILITY', 'create'),
  DoctorAvailabilityController.createBlockedDate,
);
doctorAvailabilityRouter.put(
  '/doctor/:doctorId/blocked-dates/:blockId',
  requirePermission('AVAILABILITY', 'update'),
  DoctorAvailabilityController.updateBlockedDate,
);
doctorAvailabilityRouter.delete(
  '/doctor/:doctorId/blocked-dates/:blockId',
  requirePermission('AVAILABILITY', 'delete'),
  DoctorAvailabilityController.deleteBlockedDate,
);
doctorAvailabilityRouter.post(
  '/',
  requirePermission('AVAILABILITY', 'create'),
  DoctorAvailabilityController.create,
);
doctorAvailabilityRouter.put(
  '/:id',
  requirePermission('AVAILABILITY', 'update'),
  DoctorAvailabilityController.update,
);
doctorAvailabilityRouter.delete(
  '/:id',
  requirePermission('AVAILABILITY', 'delete'),
  DoctorAvailabilityController.delete,
);
