import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import {
  requirePermission,
  requirePermissionOrPatient,
} from '@/http/middleware/rbac.middleware.js';
import { handler } from '@/http/middleware/validate.js';

import * as controller from './appointments.controller.js';
import {
  AddBlockedDateSchema,
  AddCustomAvailabilitySchema,
  cancelAppointmentSchema,
  chooseAlternativeSlotSchema,
  createAppointmentSchema,
  createRescheduleRequestSchema,
  declineRescheduleRequestSchema,
  doctorBookAppointmentSchema,
  doctorBulkRescheduleSchema,
  getSlotsQuerySchema,
  rescheduleAppointmentSchema,
  updateAppointmentSchema,
  UpdateAvailabilitySchema,
  UpdateBlockedDateSchema,
  UpdateCustomAvailabilitySchema,
  withdrawRescheduleRequestSchema,
} from './appointments.schema.js';

export const appointmentsRouter: Router = Router();

appointmentsRouter.use(requireAuth);

appointmentsRouter.get(
  '/',
  requirePermission('APPOINTMENTS', 'read', ['TODAYS_SCHEDULE']),
  controller.getAllAppointments,
);
appointmentsRouter.get(
  '/doctor-schedules',
  requirePermission('TODAYS_SCHEDULE', 'read', ['APPOINTMENTS']),
  controller.getDoctorDailySchedules,
);

appointmentsRouter.get('/doctor', controller.getDoctor);

appointmentsRouter.get(
  '/slots',
  ...handler({ query: getSlotsQuerySchema }, controller.getSlots),
);

appointmentsRouter.post(
  '/',
  requirePermissionOrPatient('APPOINTMENTS', 'create', ['TODAYS_SCHEDULE']),
  ...handler({ body: createAppointmentSchema }, controller.createAppointment),
);

appointmentsRouter.post(
  '/doctor-book',
  requirePermission('APPOINTMENTS', 'create', ['TODAYS_SCHEDULE']),
  ...handler({ body: doctorBookAppointmentSchema }, controller.doctorBookAppointment),
);

appointmentsRouter.get('/my', controller.getMyAppointments);
appointmentsRouter.get('/reschedule-requests/pending', controller.getPendingRescheduleRequests);
appointmentsRouter.get('/reschedule-requests/count', controller.getPendingRescheduleRequestsCount);
appointmentsRouter.get('/my/reschedule-requests', controller.getPendingRescheduleRequests);
appointmentsRouter.get('/doctor-reschedule-requests', controller.getDoctorRescheduleRequests);
appointmentsRouter.post('/reschedule-requests/:id/remind', controller.sendRescheduleReminder);
appointmentsRouter.get('/my/reschedule-requests/count', controller.getPendingRescheduleRequestsCount);

appointmentsRouter.get('/doctor-calendar', controller.getDoctorCalendar);
appointmentsRouter.get('/doctor-upcoming', controller.getDoctorUpcomingAppointments);
appointmentsRouter.get('/doctor-patients', controller.getDoctorPatients);
appointmentsRouter.get('/doctor-followup-patients', controller.getFollowupPatients);
appointmentsRouter.post('/doctor-resend-followup-reminder', controller.resendFollowupReminder);
appointmentsRouter.get('/doctor-patients/:patientId/appointments', controller.getPatientAppointmentsForDoctor);
appointmentsRouter.get('/doctor-patients/:patientId/timeline', controller.getPatientTimeline);
appointmentsRouter.get('/doctor-patients/:patientId/history-pdf', controller.downloadPatientHistoryPdf);

appointmentsRouter.post(
  '/doctor-reschedule-bulk',
  ...handler({ body: doctorBulkRescheduleSchema }, controller.doctorBulkReschedule),
);

appointmentsRouter.post('/upload-url', controller.getUploadUrl);

// ── Availability routes MUST come before /:id ────────────────────────────────
appointmentsRouter.get(
  '/availability',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  controller.getAvailability,
);
appointmentsRouter.put(
  '/availability',
  requirePermission('AVAILABILITY', 'update'),
  ...handler({ body: UpdateAvailabilitySchema }, controller.updateAvailability),
);

appointmentsRouter.get(
  '/availability/custom',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  controller.getCustomAvailability,
);
appointmentsRouter.post(
  '/availability/custom',
  requirePermission('AVAILABILITY', 'create'),
  ...handler({ body: AddCustomAvailabilitySchema }, controller.addCustomAvailability),
);
appointmentsRouter.put(
  '/availability/custom/:id',
  requirePermission('AVAILABILITY', 'update'),
  ...handler({ body: UpdateCustomAvailabilitySchema }, controller.updateCustomAvailability),
);
appointmentsRouter.delete(
  '/availability/custom/:id',
  requirePermission('AVAILABILITY', 'delete'),
  controller.deleteCustomAvailability,
);

appointmentsRouter.get(
  '/availability/blocked',
  requirePermission('AVAILABILITY', 'read', ['DOCTORS', 'APPOINTMENTS', 'TODAYS_SCHEDULE']),
  controller.getBlockedDates,
);
appointmentsRouter.post(
  '/availability/blocked',
  requirePermission('AVAILABILITY', 'create'),
  ...handler({ body: AddBlockedDateSchema }, controller.addBlockedDate),
);
appointmentsRouter.put(
  '/availability/blocked/:id',
  requirePermission('AVAILABILITY', 'update'),
  ...handler({ body: UpdateBlockedDateSchema }, controller.updateBlockedDate),
);
appointmentsRouter.delete(
  '/availability/blocked/:id',
  requirePermission('AVAILABILITY', 'delete'),
  controller.removeBlockedDate,
);

// ── Sub-routes with /:id prefix ──────────────────────────────────────────────
appointmentsRouter.get('/:id/patient-prescriptions', controller.getPatientPrescriptions);
appointmentsRouter.get('/:id/prescriptions/:prescriptionId/pdf', controller.downloadPrescriptionPdf);
appointmentsRouter.get('/:id/prescriptions/:prescriptionId/html', controller.downloadPrescriptionHtml);

appointmentsRouter.patch(
  '/:id/complete',
  requirePermission('APPOINTMENTS', 'update', ['TODAYS_SCHEDULE']),
  controller.markComplete,
);
appointmentsRouter.post(
  '/:id/prescription',
  requirePermission('PRESCRIPTIONS', 'create'),
  controller.savePrescription,
);

appointmentsRouter.post(
  '/:id/reschedule',
  requirePermissionOrPatient('APPOINTMENTS', 'update', ['TODAYS_SCHEDULE']),
  ...handler(
    { body: rescheduleAppointmentSchema },
    controller.rescheduleAppointment,
  ),
);

// ── Doctor-Initiated Reschedule Request Confirmation Routes ─────────────────
appointmentsRouter.post(
  '/:id/reschedule-request',
  ...handler(
    { body: createRescheduleRequestSchema },
    controller.createRescheduleRequest,
  ),
);

appointmentsRouter.get(
  '/:id/reschedule-request',
  controller.getActiveRescheduleRequest,
);

appointmentsRouter.post(
  '/:id/reschedule-request/confirm',
  controller.confirmRescheduleRequest,
);

appointmentsRouter.post(
  '/:id/reschedule-request/decline',
  ...handler(
    { body: declineRescheduleRequestSchema },
    controller.declineRescheduleRequest,
  ),
);

appointmentsRouter.post(
  '/:id/reschedule-request/choose-alternative',
  ...handler(
    { body: chooseAlternativeSlotSchema },
    controller.chooseAlternativeRescheduleSlot,
  ),
);

appointmentsRouter.post(
  '/:id/reschedule-request/withdraw',
  ...handler(
    { body: withdrawRescheduleRequestSchema },
    controller.withdrawRescheduleRequest,
  ),
);

appointmentsRouter.post(
  '/:id/cancel',
  requirePermissionOrPatient('APPOINTMENTS', 'delete', ['TODAYS_SCHEDULE']),
  ...handler({ body: cancelAppointmentSchema }, controller.cancelAppointment),
);

appointmentsRouter.put(
  '/:id',
  requirePermission('APPOINTMENTS', 'update', ['TODAYS_SCHEDULE']),
  ...handler(
    { body: updateAppointmentSchema },
    controller.updateAppointment,
  ),
);

// ── Wildcard GET /:id must come dead LAST ────────────────────────────────────
appointmentsRouter.get('/:id', controller.getAppointmentById);
