import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
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
  UpdateAvailabilitySchema,
  UpdateBlockedDateSchema,
  UpdateCustomAvailabilitySchema,
  withdrawRescheduleRequestSchema,
} from './appointments.schema.js';

export const appointmentsRouter: Router = Router();

appointmentsRouter.use(requireAuth);

appointmentsRouter.get('/doctor', controller.getDoctor);

appointmentsRouter.get(
  '/slots',
  ...handler({ query: getSlotsQuerySchema }, controller.getSlots),
);

appointmentsRouter.post(
  '/',
  ...handler({ body: createAppointmentSchema }, controller.createAppointment),
);

appointmentsRouter.post(
  '/doctor-book',
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
appointmentsRouter.get('/availability', controller.getAvailability);
appointmentsRouter.put(
  '/availability',
  ...handler({ body: UpdateAvailabilitySchema }, controller.updateAvailability),
);

appointmentsRouter.get('/availability/custom', controller.getCustomAvailability);
appointmentsRouter.post(
  '/availability/custom',
  ...handler({ body: AddCustomAvailabilitySchema }, controller.addCustomAvailability),
);
appointmentsRouter.put(
  '/availability/custom/:id',
  ...handler({ body: UpdateCustomAvailabilitySchema }, controller.updateCustomAvailability),
);
appointmentsRouter.delete('/availability/custom/:id', controller.deleteCustomAvailability);

appointmentsRouter.get('/availability/blocked', controller.getBlockedDates);
appointmentsRouter.post(
  '/availability/blocked',
  ...handler({ body: AddBlockedDateSchema }, controller.addBlockedDate),
);
appointmentsRouter.put(
  '/availability/blocked/:id',
  ...handler({ body: UpdateBlockedDateSchema }, controller.updateBlockedDate),
);
appointmentsRouter.delete(
  '/availability/blocked/:id',
  controller.removeBlockedDate,
);

// ── Sub-routes with /:id prefix ──────────────────────────────────────────────
appointmentsRouter.get('/:id/patient-prescriptions', controller.getPatientPrescriptions);
appointmentsRouter.get('/:id/prescriptions/:prescriptionId/pdf', controller.downloadPrescriptionPdf);
appointmentsRouter.get('/:id/prescriptions/:prescriptionId/html', controller.downloadPrescriptionHtml);

appointmentsRouter.patch('/:id/complete', controller.markComplete);
appointmentsRouter.post('/:id/prescription', controller.savePrescription);

appointmentsRouter.post(
  '/:id/reschedule',
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
  ...handler({ body: cancelAppointmentSchema }, controller.cancelAppointment),
);

// ── Wildcard GET /:id must come dead LAST ────────────────────────────────────
appointmentsRouter.get('/:id', controller.getAppointmentById);
