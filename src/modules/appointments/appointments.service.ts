
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
import { ConflictError, NotFoundError } from '@/http/errors.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

import { appointmentReminderService } from './appointmentReminder.service.js';
import { formatAppointmentDateTime } from './appointments.formatter.js';
import * as repo from './appointments.repository.js';
import type {
  Appointment,
  AppointmentRescheduleRequest,
  ChooseAlternativeSlotInput,
  CreateAppointmentInput,
  CreateRescheduleRequestInput,
  DateSlotSummary,
  DoctorProfile,
  DoctorRescheduleRequestItem,
  RescheduleAppointmentInput,
} from './appointments.types.js';

export async function getDoctorInfo(): Promise<DoctorProfile> {
  const doc = await repo.getDefaultDoctor();
  if (!doc) {
    return {
      userId: '7710627c-7f9f-4111-bb0a-fc2c1bed95db',
      fullName: 'Dr. Narendran',
      qualifications: 'MBBS, DM (Medical Oncology)',
      specialty: 'Medical Oncology',
      clinicName: 'Adyar Clinic',
      clinicAddress: '12, Lattice Bridge Road, Adyar, Chennai - 600020',
      contactPhone: '+91 98765 43210',
    };
  }
  return doc;
}

export async function getDoctorAvailability(
  doctorId: string,
  date: string,
  locationId?: string | null,
) {
  return repo.getDoctorAvailability(doctorId, date, locationId);
}

export async function getSlots(
  startDate?: string,
  days = 14,
  doctorId?: string,
  locationId?: string | null,
): Promise<{
  doctor: DoctorProfile;
  summaries: DateSlotSummary[];
  nextAvailableSlot?: string | undefined;
}> {
  const doctor = (doctorId ? await repo.getDoctorById(doctorId) : null) || (await getDoctorInfo());
  const startStr = startDate ?? formatDateKey(new Date());
  const summaries = await repo.getSlotsForDoctor(doctor.userId, startStr, days, locationId);

  let nextAvailableSlot: string | undefined;
  for (const day of summaries) {
    const freeSlot = day.slots.find(s => !s.isBooked);
    if (freeSlot) {
      nextAvailableSlot = freeSlot.slotTime;
      break;
    }
  }

  return { doctor, summaries, nextAvailableSlot };
}

export async function createAppointment(
  patientId: string,
  input: CreateAppointmentInput,
  actorRole?: string,
): Promise<Appointment> {
  const targetDoctorId = input.doctorId || input.doctor_id;
  const slot = await repo.getSlotById(input.slotId, targetDoctorId);
  if (!slot) {
    throw new NotFoundError('Appointment slot not found.');
  }

  const finalDoctorId = slot.doctorId || targetDoctorId;
  const doctor = (finalDoctorId ? await repo.getDoctorById(finalDoctorId) : null) || (await getDoctorInfo());

  if (slot.isBooked) {
    const datePart = slot.slotTime.split('T')[0]!;
    const { summaries } = await getSlots(datePart, 3, doctor.userId);
    const alternativeSlots = summaries
      .flatMap(s => s.slots)
      .filter(s => !s.isBooked && s.id !== input.slotId)
      .slice(0, 3);
    throw new ConflictError('Selected slot is no longer available.', {
      details: { nearestSlots: alternativeSlots },
    });
  }

  const scheduledStart = slot.slotTime;
  const startDateObj = new Date(`${scheduledStart}+05:30`);
  const scheduledEndObj = new Date(startDateObj.getTime() + 25 * 60 * 1000);
  const dateStr = formatDateKey(startDateObj);
  const tokenNumber = await repo.getNextTokenNumber(doctor.userId, dateStr);

  const appt = await repo.createAppointmentTx({
    patientId,
    doctorId: doctor.userId,
    slotId: input.slotId,
    scheduledStart: startDateObj.toISOString(),
    scheduledEnd: scheduledEndObj.toISOString(),
    tokenNumber,
    purpose: input.purpose,
    patientNote: input.patientNote,
    patientName: input.patientName,
    patientPhone: input.patientPhone,
  });

  if (!appt) {
    const datePart = slot.slotTime.split('T')[0]!;
    const { summaries } = await getSlots(datePart, 3, doctor.userId);
    const alternativeSlots = summaries
      .flatMap(s => s.slots)
      .filter(s => !s.isBooked && s.id !== input.slotId)
      .slice(0, 3);
    throw new ConflictError('Selected slot is no longer available.', {
      details: { nearestSlots: alternativeSlots },
    });
  }

  logger.info({ appointmentId: appt.id }, '[Appointment] Booking successful');

  const { dateStr: localDate, timeStr: localTime } = formatAppointmentDateTime(appt.scheduledStart);
  const rawToken = appt.tokenNumber ? String(appt.tokenNumber).trim() : '01';
  const tokenDisplay = rawToken.startsWith('#') ? rawToken : `#${rawToken}`;

  // Schedule 24h and 30m reminders
  void appointmentReminderService.scheduleRemindersForAppointment({
    id: appt.id,
    patientId: appt.patientId,
    scheduledStart: appt.scheduledStart,
  }).catch(e => logger.warn({ error: e, appointmentId: appt.id }, '[ReminderService] Failed to schedule reminders for new appointment'));

  // Asynchronously trigger push notifications after transaction commit
  if (actorRole === 'doctor') {
    void notificationService.sendToPatient(patientId, {
      type: NotificationType.APPOINTMENT_BOOKED,
      title: 'New Appointment Booked',
      body: `Dr. Narendran has booked an appointment for you for ${localDate} at ${localTime}. Token: ${tokenDisplay}`,
      entityType: 'APPOINTMENT',
      entityId: appt.id,
      route: 'AppointmentDetail',
      idempotencyKey: `appt_booked:${appt.id}`,
      data: {
        type: NotificationType.APPOINTMENT_BOOKED,
        appointmentId: appt.id,
        screen: 'AppointmentDetail',
        tokenNumber: appt.tokenNumber,
      },
    }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send doctor-booked appointment notification to patient'));
  } else {
    void notificationService.sendToPatient(patientId, {
      type: NotificationType.APPOINTMENT_BOOKED,
      title: 'Appointment Confirmed',
      body: `Your appointment with Dr. Narendran is confirmed for ${localDate} at ${localTime}. Token: ${tokenDisplay}`,
      entityType: 'APPOINTMENT',
      entityId: appt.id,
      route: 'AppointmentDetail',
      idempotencyKey: `appt_booked:${appt.id}`,
      data: {
        type: NotificationType.APPOINTMENT_BOOKED,
        appointmentId: appt.id,
        screen: 'AppointmentDetail',
        tokenNumber: appt.tokenNumber,
      },
    }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send appointment booked notification to patient'));

    void notificationService.sendToDoctor(doctor.userId, {
      type: NotificationType.APPOINTMENT_BOOKED,
      title: 'New Appointment Booked',
      body: input.patientName
        ? `New appointment booked by ${input.patientName} for ${localDate} at ${localTime}. Token: ${tokenDisplay}`
        : `A patient has booked a new appointment with you for ${localDate} at ${localTime}. Token: ${tokenDisplay}`,
      entityType: 'APPOINTMENT',
      entityId: appt.id,
      route: 'AppointmentDetail',
      idempotencyKey: `doc_appt_booked:${appt.id}`,
      data: {
        type: NotificationType.APPOINTMENT_BOOKED,
        appointmentId: appt.id,
        screen: 'AppointmentDetail',
        tokenNumber: appt.tokenNumber,
      },
    }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send new appointment notification to doctor'));
  }

  // Check if this appointment fulfills an active follow-up
  try {
    const { pool } = await import('@/db/pool.js');
    const updateRes = await pool.query(
      `UPDATE prescriptions
       SET follow_up_status = 'booked', follow_up_booked_appointment_id = $1
       WHERE (patient_id::text = $2 OR patient_id IN (SELECT id FROM patients WHERE user_account_id::text = $2))
         AND follow_up_status = 'pending'
       RETURNING id`,
      [appt.id, patientId],
    );

    if (updateRes.rowCount && updateRes.rowCount > 0) {
      void notificationService.sendToDoctor(doctor.userId, {
        type: NotificationType.FOLLOW_UP_BOOKED,
        title: '🗓️ Follow-up Appointment Booked',
        body: `${input.patientName || 'Patient'} confirmed and booked their follow-up checkup for ${dateStr}.`,
        entityType: 'APPOINTMENT',
        entityId: appt.id,
        route: 'AppointmentDetail',
        data: {
          appointmentId: appt.id,
          patientName: input.patientName || 'Patient',
          date: dateStr,
        },
      }).catch(e => console.warn('Failed to send follow-up booked notification to doctor:', e));
    }
  } catch (followUpErr) {
    console.warn('Failed to update follow-up status on booking:', followUpErr);
  }

  return appt;
}

export async function getMyAppointments(
  patientId: string,
  tab: 'upcoming' | 'history',
): Promise<Appointment[]> {
  return repo.getAppointmentsByPatient(patientId, tab);
}

export async function getPendingRescheduleRequests(
  patientUserId: string,
): Promise<repo.PendingRescheduleRequestItem[]> {
  return repo.getPendingRescheduleRequestsByPatient(patientUserId);
}

export async function getPendingRescheduleRequestsCount(
  patientUserId: string,
): Promise<number> {
  return repo.getPendingRescheduleRequestsCountByPatient(patientUserId);
}

export async function getAppointmentById(
  id: string,
  patientId: string,
): Promise<Appointment> {
  const appt = await repo.getAppointmentById(id, patientId);
  if (!appt) {
    throw new NotFoundError('Appointment not found');
  }
  return appt;
}

export async function rescheduleAppointment(
  appointmentId: string,
  userId: string,
  input: RescheduleAppointmentInput,
  actorRole?: string,
): Promise<Appointment> {
  const updated = await repo.rescheduleAppointmentTx({
    appointmentId,
    userId,
    newSlotId: input.newSlotId,
    reason: input.reason,
  });

  if (!updated) {
    throw new ConflictError('The new slot selected is no longer available.');
  }

  logger.info({ appointmentId: updated.id }, '[Appointment] Reschedule successful');

  const { dateStr: reschedDate, timeStr: reschedTime } = formatAppointmentDateTime(updated.scheduledStart);

  // Reschedule 24h and 30m reminders
  void appointmentReminderService.rescheduleRemindersForAppointment({
    id: updated.id,
    patientId: updated.patientId,
    scheduledStart: updated.scheduledStart,
  }).catch(e => logger.warn({ error: e, appointmentId: updated.id }, '[ReminderService] Failed to reschedule reminders'));

  const isDoctor = actorRole === 'doctor' || (await repo.getDoctorIdByUserId(userId)) !== null;

  if (isDoctor) {
    // Rescheduled by Doctor -> Notify Patient
    if (updated.patientId) {
      void notificationService.sendToPatient(updated.patientId, {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: '🗓️ Appointment Rescheduled',
        body: `Your appointment with Dr. Narendran has been rescheduled to ${reschedDate} at ${reschedTime}.`,
        entityType: 'APPOINTMENT',
        entityId: updated.id,
        route: 'AppointmentDetail',
        idempotencyKey: `appt_resched:${updated.id}:${updated.scheduledStart}`,
        data: {
          type: NotificationType.APPOINTMENT_RESCHEDULED,
          appointmentId: updated.id,
          date: reschedDate,
          time: reschedTime,
          status: 'rescheduled',
          scheduledStart: updated.scheduledStart,
          screen: 'AppointmentDetail',
        },
      }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send reschedule notification to patient'));
    }
  } else {
    // Rescheduled by Patient -> Notify Doctor & Patient Confirmation
    if (updated.doctorId) {
      void notificationService.sendToDoctor(updated.doctorId, {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: '🗓️ Appointment Rescheduled',
        body: `A patient has rescheduled an appointment to ${reschedDate} at ${reschedTime}.`,
        entityType: 'APPOINTMENT',
        entityId: updated.id,
        route: 'AppointmentDetail',
        idempotencyKey: `doc_appt_resched:${updated.id}:${updated.scheduledStart}`,
        data: {
          type: NotificationType.APPOINTMENT_RESCHEDULED,
          appointmentId: updated.id,
          date: reschedDate,
          time: reschedTime,
          status: 'rescheduled',
          scheduledStart: updated.scheduledStart,
          screen: 'AppointmentDetail',
        },
      }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send reschedule notification to doctor'));
    }

    void notificationService.sendToPatient(updated.patientId, {
      type: NotificationType.APPOINTMENT_RESCHEDULED,
      title: '🗓️ Appointment Rescheduled',
      body: `Your appointment has been rescheduled to ${reschedDate} at ${reschedTime}.`,
      entityType: 'APPOINTMENT',
      entityId: updated.id,
      route: 'AppointmentDetail',
      idempotencyKey: `appt_resched:${updated.id}:${updated.scheduledStart}`,
      data: {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        appointmentId: updated.id,
        date: reschedDate,
        time: reschedTime,
        status: 'rescheduled',
        scheduledStart: updated.scheduledStart,
        screen: 'AppointmentDetail',
      },
    }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send reschedule confirmation to patient'));
  }

  return updated;
}

export async function cancelAppointment(
  appointmentId: string,
  userId: string,
  reason?: string,
  actorRole?: string,
): Promise<Appointment> {
  const cancelled = await repo.cancelAppointmentTx({
    appointmentId,
    userId,
    reason,
  });

  if (!cancelled) {
    throw new NotFoundError('Appointment not found.');
  }

  logger.info({ appointmentId: cancelled.id }, '[Appointment] Cancellation successful');

  const { dateStr: cancelDate, timeStr: cancelTime } = formatAppointmentDateTime(cancelled.scheduledStart);
  const reasonText = reason ? ` Reason: ${reason}` : '';

  // Cancel pending reminders for cancelled appointment
  void appointmentReminderService.cancelRemindersForAppointment(cancelled.id).catch(e =>
    logger.warn({ error: e, appointmentId: cancelled.id }, '[ReminderService] Failed to cancel reminders for cancelled appointment'),
  );

  const isDoctor = actorRole === 'doctor' || (await repo.getDoctorIdByUserId(userId)) !== null;

  if (isDoctor) {
    // Cancelled by Doctor -> Notify Patient
    if (cancelled.patientId) {
      void notificationService.sendToPatient(cancelled.patientId, {
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Appointment Cancelled',
        body: `Your appointment on ${cancelDate} at ${cancelTime} has been cancelled.${reasonText}`,
        entityType: 'APPOINTMENT',
        entityId: cancelled.id,
        route: 'AppointmentDetail',
        idempotencyKey: `appt_cancel:${cancelled.id}`,
        data: {
          type: NotificationType.APPOINTMENT_CANCELLED,
          appointmentId: cancelled.id,
          screen: 'AppointmentDetail',
          reason: reason ?? '',
        },
      }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send cancel notification to patient'));
    }
  } else {
    // Cancelled by Patient -> Notify Doctor & Patient Confirmation
    if (cancelled.doctorId) {
      void notificationService.sendToDoctor(cancelled.doctorId, {
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Appointment Cancelled',
        body: `A patient has cancelled their appointment scheduled for ${cancelDate} at ${cancelTime}.${reasonText}`,
        entityType: 'APPOINTMENT',
        entityId: cancelled.id,
        route: 'AppointmentDetail',
        idempotencyKey: `doc_appt_cancel:${cancelled.id}`,
        data: {
          type: NotificationType.APPOINTMENT_CANCELLED,
          appointmentId: cancelled.id,
          screen: 'AppointmentDetail',
          reason: reason ?? '',
        },
      }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send cancel notification to doctor'));
    }

    void notificationService.sendToPatient(cancelled.patientId, {
      type: NotificationType.APPOINTMENT_CANCELLED,
      title: 'Appointment Cancelled',
      body: `Your appointment scheduled for ${cancelDate} at ${cancelTime} has been cancelled.${reasonText}`,
      entityType: 'APPOINTMENT',
      entityId: cancelled.id,
      route: 'AppointmentDetail',
      idempotencyKey: `appt_cancel:${cancelled.id}`,
      data: {
        type: NotificationType.APPOINTMENT_CANCELLED,
        appointmentId: cancelled.id,
        screen: 'AppointmentDetail',
        reason: reason ?? '',
      },
    }).catch(e => logger.warn({ error: e }, '[FCM] Failed to send cancel confirmation to patient'));
  }

  return cancelled;
}

export async function createRescheduleRequest(
  appointmentId: string,
  doctorUserId: string,
  input: CreateRescheduleRequestInput,
): Promise<AppointmentRescheduleRequest> {
  const request = await repo.createRescheduleRequestTx({
    appointmentId,
    doctorId: doctorUserId,
    newSlotId: input.newSlotId,
    reason: input.reason,
  });

  if (!request) {
    throw new ConflictError(
      'The proposed slot is no longer available or appointment cannot be rescheduled.',
    );
  }

  logger.info(
    { appointmentId, requestId: request.id },
    '[Appointment] Reschedule request proposed by doctor',
  );

  const { dateStr: propDate, timeStr: propTime } = formatAppointmentDateTime(request.proposedStart);
  const reasonText = input.reason ? ` Reason: ${input.reason}` : '';

  // Dispatch persistent in-app notification & FCM push to patient
  if (request.patientId) {
    void notificationService
      .sendToPatient(request.patientId, {
        type: NotificationType.DOCTOR_RESCHEDULE_PROPOSED,
        title: 'Appointment Reschedule Requested',
        body: `Dr. Narendran requested to reschedule your appointment to ${propDate} at ${propTime}.${reasonText}`,
        entityType: 'APPOINTMENT',
        entityId: appointmentId,
        route: 'AppointmentDetail',
        idempotencyKey: `resched_prop:${request.id}`,
        data: {
          type: NotificationType.DOCTOR_RESCHEDULE_PROPOSED,
          appointmentId,
          requestId: request.id,
          proposedStart: request.proposedStart,
          proposedEnd: request.proposedEnd,
          reason: input.reason ?? '',
          screen: 'AppointmentDetail',
        },
      })
      .catch((e) =>
        logger.warn(
          { error: e, appointmentId },
          '[FCM] Failed to send reschedule proposal notification to patient',
        ),
      );
  }

  return request;
}

export async function getActiveRescheduleRequest(
  appointmentId: string,
): Promise<AppointmentRescheduleRequest | null> {
  return repo.getActiveRescheduleRequestByAppointmentId(appointmentId);
}

export async function confirmRescheduleRequest(
  appointmentId: string,
  patientUserId: string,
): Promise<Appointment> {
  const updated = await repo.confirmRescheduleRequestTx({
    appointmentId,
    patientUserId,
  });

  if (!updated) {
    throw new ConflictError(
      'Reschedule request has expired, was cancelled, or the proposed slot is no longer available.',
    );
  }

  logger.info(
    { appointmentId: updated.id },
    '[Appointment] Reschedule proposal confirmed by patient',
  );

  const { dateStr: confDate, timeStr: confTime } = formatAppointmentDateTime(updated.scheduledStart);

  // Reschedule 24h and 30m reminders
  void appointmentReminderService.rescheduleRemindersForAppointment({
    id: updated.id,
    patientId: updated.patientId,
    scheduledStart: updated.scheduledStart,
  }).catch(e => logger.warn({ error: e, appointmentId: updated.id }, '[ReminderService] Failed to reschedule reminders'));

  // Notify Doctor
  if (updated.doctorId) {
    void notificationService
      .sendToDoctor(updated.doctorId, {
        type: NotificationType.RESCHEDULE_CONFIRMED,
        title: 'Reschedule Confirmed',
        body: `The patient confirmed the proposed appointment reschedule to ${confDate} at ${confTime}.`,
        entityType: 'APPOINTMENT',
        entityId: updated.id,
        route: 'AppointmentDetail',
        idempotencyKey: `doc_resched_confirm:${updated.id}:${updated.scheduledStart}`,
        data: {
          type: NotificationType.RESCHEDULE_CONFIRMED,
          appointmentId: updated.id,
          screen: 'AppointmentDetail',
        },
      })
      .catch((e) =>
        logger.warn(
          { error: e },
          '[FCM] Failed to send reschedule confirmation notification to doctor',
        ),
      );
  }

  // Notify Patient confirmation
  void notificationService
    .sendToPatient(updated.patientId, {
      type: NotificationType.APPOINTMENT_CONFIRMED,
      title: 'Appointment Confirmed',
      body: `Your appointment has been confirmed for ${confDate} at ${confTime}.`,
      entityType: 'APPOINTMENT',
      entityId: updated.id,
      route: 'AppointmentDetail',
      idempotencyKey: `resched_confirm:${updated.id}:${updated.scheduledStart}`,
      data: {
        type: NotificationType.APPOINTMENT_CONFIRMED,
        appointmentId: updated.id,
        screen: 'AppointmentDetail',
      },
    })
    .catch((e) =>
      logger.warn(
        { error: e },
        '[FCM] Failed to send reschedule confirmation notification to patient',
      ),
    );

  return updated;
}

export async function declineRescheduleRequest(
  appointmentId: string,
  patientUserId: string,
  reason?: string,
): Promise<{ status: 'declined' }> {
  const success = await repo.declineRescheduleRequestTx({
    appointmentId,
    patientUserId,
    reason,
  });

  if (!success) {
    throw new NotFoundError(
      'No pending reschedule request found for this appointment.',
    );
  }

  logger.info(
    { appointmentId },
    '[Appointment] Reschedule proposal declined by patient',
  );

  const appt = await repo.getAppointmentById(appointmentId, patientUserId);
  if (appt?.doctorId) {
    void notificationService
      .sendToDoctor(appt.doctorId, {
        type: NotificationType.RESCHEDULE_DECLINED,
        title: 'Reschedule Declined',
        body: 'The patient declined the proposed appointment time slot.',
        entityType: 'APPOINTMENT',
        entityId: appointmentId,
        route: 'AppointmentDetail',
        idempotencyKey: `doc_resched_decline:${appointmentId}`,
        data: {
          type: NotificationType.RESCHEDULE_DECLINED,
          appointmentId,
          screen: 'AppointmentDetail',
        },
      })
      .catch((e) =>
        logger.warn(
          { error: e },
          '[FCM] Failed to send reschedule decline notification to doctor',
        ),
      );
  }

  // Notify Patient confirmation
  void notificationService
    .sendToPatient(patientUserId, {
      type: NotificationType.RESCHEDULE_DECLINED,
      title: 'Reschedule Request Declined',
      body: 'You declined the doctor\'s reschedule proposal. Your current appointment remains unchanged.',
      entityType: 'APPOINTMENT',
      entityId: appointmentId,
      route: 'AppointmentDetail',
      idempotencyKey: `resched_decline:${appointmentId}`,
      data: {
        type: NotificationType.RESCHEDULE_DECLINED,
        appointmentId,
        screen: 'AppointmentDetail',
      },
    })
    .catch((e) =>
      logger.warn(
        { error: e },
        '[FCM] Failed to send reschedule decline confirmation to patient',
      ),
    );

  return { status: 'declined' };
}

export async function chooseAlternativeRescheduleSlot(
  appointmentId: string,
  patientUserId: string,
  input: ChooseAlternativeSlotInput,
): Promise<Appointment> {
  const updated = await repo.chooseAlternativeRescheduleSlotTx({
    appointmentId,
    patientUserId,
    newSlotId: input.newSlotId,
    reason: input.reason,
  });

  if (!updated) {
    throw new ConflictError('The alternative slot selected is no longer available.');
  }

  logger.info(
    { appointmentId: updated.id },
    '[Appointment] Alternative slot selected and booked by patient',
  );

  const { dateStr: altDate, timeStr: altTime } = formatAppointmentDateTime(updated.scheduledStart);

  // Reschedule 24h and 30m reminders
  void appointmentReminderService.rescheduleRemindersForAppointment({
    id: updated.id,
    patientId: updated.patientId,
    scheduledStart: updated.scheduledStart,
  }).catch(e => logger.warn({ error: e, appointmentId: updated.id }, '[ReminderService] Failed to reschedule reminders'));

  if (updated.doctorId) {
    void notificationService
      .sendToDoctor(updated.doctorId, {
        type: NotificationType.RESCHEDULE_ALTERNATIVE_BOOKED,
        title: 'Appointment Rescheduled',
        body: `The patient selected an alternative appointment time slot for ${altDate} at ${altTime}.`,
        entityType: 'APPOINTMENT',
        entityId: updated.id,
        route: 'AppointmentDetail',
        idempotencyKey: `doc_resched_alt:${updated.id}:${updated.scheduledStart}`,
        data: {
          type: NotificationType.RESCHEDULE_ALTERNATIVE_BOOKED,
          appointmentId: updated.id,
          screen: 'AppointmentDetail',
        },
      })
      .catch((e) =>
        logger.warn(
          { error: e },
          '[FCM] Failed to send alternative booking notification to doctor',
        ),
      );
  }

  void notificationService
    .sendToPatient(updated.patientId, {
      type: NotificationType.APPOINTMENT_RESCHEDULED,
      title: 'Appointment Rescheduled',
      body: `Your appointment has been rescheduled to ${altDate} at ${altTime}.`,
      entityType: 'APPOINTMENT',
      entityId: updated.id,
      route: 'AppointmentDetail',
      idempotencyKey: `resched_alt:${updated.id}:${updated.scheduledStart}`,
      data: {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        appointmentId: updated.id,
        screen: 'AppointmentDetail',
      },
    })
    .catch((e) =>
      logger.warn(
        { error: e },
        '[FCM] Failed to send alternative slot booking notification to patient',
      ),
    );

  return updated;
}

export async function getDoctorRescheduleRequests(
  doctorUserId: string,
  status?: string,
): Promise<DoctorRescheduleRequestItem[]> {
  const doctorId = await repo.getDoctorIdByUserId(doctorUserId);
  const effectiveDoctorId = doctorId || doctorUserId;
  return repo.getDoctorRescheduleRequests(effectiveDoctorId, status);
}

export async function sendRescheduleReminder(
  requestId: string,
  doctorUserId: string,
): Promise<DoctorRescheduleRequestItem> {
  const doctorId = await repo.getDoctorIdByUserId(doctorUserId);
  const effectiveDoctorId = doctorId || doctorUserId;

  const result = await repo.sendRescheduleReminderTx({
    requestId,
    doctorId: effectiveDoctorId,
  });

  if (!result) {
    throw new ConflictError(
      'Reschedule request not found, is no longer pending, or has expired.',
    );
  }

  const { request, patientUserId } = result;

  // Format proposed start time for friendly display
  const proposedDate = new Date(request.proposedStart).toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const proposedTime = new Date(request.proposedStart).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

  // Dispatch high-priority reminder notification to patient
  void notificationService
    .sendToPatient(patientUserId, {
      type: NotificationType.DOCTOR_RESCHEDULE_PROPOSED,
      title: '⏳ Reschedule Request Pending',
      body: `Dr. Narendran is awaiting your confirmation for the rescheduled appointment on ${proposedDate} at ${proposedTime}. Tap to confirm or cancel.`,
      entityType: 'APPOINTMENT',
      entityId: request.appointmentId,
      route: 'AppointmentDetails',
      data: {
        type: NotificationType.DOCTOR_RESCHEDULE_PROPOSED,
        appointmentId: request.appointmentId,
        requestId: request.id,
        proposedStart: request.proposedStart,
        proposedEnd: request.proposedEnd,
        reason: request.reason ?? '',
        screen: 'AppointmentDetails',
        isReminder: 'true',
      },
    })
    .catch((e) =>
      logger.warn(
        { error: e, requestId: request.id },
        '[FCM] Failed to send reschedule reminder notification to patient',
      ),
    );

  logger.info(
    { requestId: request.id, appointmentId: request.appointmentId, patientUserId },
    '[Appointment] Reschedule reminder dispatched to patient',
  );

  return request;
}

export async function withdrawRescheduleRequest(
  appointmentId: string,
  doctorUserId: string,
  reason?: string,
): Promise<AppointmentRescheduleRequest> {
  const req = await repo.withdrawRescheduleRequestTx({
    appointmentId,
    doctorUserId,
    reason,
  });

  if (!req) {
    throw new NotFoundError(
      'Pending reschedule request not found or you are not authorized to withdraw it.',
    );
  }

  logger.info(
    { appointmentId, requestId: req.id },
    '[Appointment] Reschedule proposal withdrawn by doctor',
  );

  if (req.patientId) {
    const reasonText = reason ? ` Reason: ${reason}` : '';
    void notificationService
      .sendToPatient(req.patientId, {
        type: NotificationType.DOCTOR_RESCHEDULE_WITHDRAWN,
        title: 'Reschedule Proposal Withdrawn',
        body: `Dr. Narendran withdrew the reschedule proposal. Your current appointment remains active.${reasonText}`,
        entityType: 'APPOINTMENT',
        entityId: appointmentId,
        route: 'AppointmentDetail',
        idempotencyKey: `resched_withdraw:${req.id}`,
        data: {
          type: NotificationType.DOCTOR_RESCHEDULE_WITHDRAWN,
          appointmentId,
          requestId: req.id,
          screen: 'AppointmentDetail',
        },
      })
      .catch((e) =>
        logger.warn(
          { error: e, appointmentId },
          '[FCM] Failed to send reschedule withdrawal notification to patient',
        ),
      );
  }

  return req;
}

export async function sweepExpiredRescheduleRequests(): Promise<void> {
  try {
    const expired = await repo.sweepExpiredRescheduleRequests();
    for (const item of expired) {
      if (item.patientId) {
        void notificationService
          .sendToPatient(item.patientId, {
            type: NotificationType.DOCTOR_RESCHEDULE_EXPIRED,
            title: 'Reschedule Request Expired',
            body: 'The reschedule request for your appointment has expired. Your current appointment remains active.',
            entityType: 'APPOINTMENT',
            entityId: item.appointmentId,
            route: 'AppointmentDetail',
            idempotencyKey: `resched_expired:${item.id}`,
            data: {
              type: NotificationType.DOCTOR_RESCHEDULE_EXPIRED,
              appointmentId: item.appointmentId,
              requestId: item.id,
              screen: 'AppointmentDetail',
            },
          })
          .catch((e) =>
            logger.warn(
              { error: e, appointmentId: item.appointmentId },
              '[FCM] Failed to send reschedule expiry notification to patient',
            ),
          );
      }
    }
  } catch (err) {
    logger.warn({ error: err }, '[RescheduleSweep] Failed to sweep expired requests');
  }
}


