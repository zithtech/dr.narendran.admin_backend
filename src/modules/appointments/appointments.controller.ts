/* eslint-disable */
import type { Request, Response } from 'express';
import puppeteer from 'puppeteer';

import { pool } from '@/db/pool.js';
import { UnauthorizedError } from '@/http/errors.js';
import type { ValidatedData } from '@/http/middleware/validate.js';
import { logger } from '@/lib/logger.js';
import { PrescriptionTemplatesService } from '@/modules/prescription_templates/prescription_templates.service.js';
import { medicineScheduleService } from '@/modules/prescriptions/medicineSchedule.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

import * as repo from './appointments.repository.js';
import type {
  AddBlockedDateSchema,
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
  withdrawRescheduleRequestSchema,
} from './appointments.schema.js';
import * as service from './appointments.service.js';

type CreateRescheduleRequestInput = ValidatedData<{ body: typeof createRescheduleRequestSchema }>;
type DeclineRescheduleRequestInput = ValidatedData<{ body: typeof declineRescheduleRequestSchema }>;
type ChooseAlternativeSlotInput = ValidatedData<{ body: typeof chooseAlternativeSlotSchema }>;
type WithdrawRescheduleRequestInput = ValidatedData<{ body: typeof withdrawRescheduleRequestSchema }>;

// GET /appointments/doctor-calendar?date=YYYY-MM-DD
export async function getDoctorCalendar(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const dateStr = (req.query['date'] as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const appointments = await repo.getAppointmentsForDoctor(doctorId, dateStr);

  // Build summary counts
  const total = appointments.length;
  const done = appointments.filter(a => a.status === 'completed').length;
  const arrived = appointments.filter(a => a.status === 'arrived').length;
  const pending = appointments.filter(a => a.status === 'scheduled' || a.status === 'reschedule').length;

  // Split into morning (before 12:00) and evening (12:00 onwards) by local time
  const morning = appointments.filter(a => {
    const hour = new Date(a.scheduledStart).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' });
    return parseInt(hour, 10) < 12;
  });
  const evening = appointments.filter(a => {
    const hour = new Date(a.scheduledStart).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' });
    return parseInt(hour, 10) >= 12;
  });

  res.json({
    status: 'success',
    data: {
      summary: { total, done, arrived, pending },
      morning,
      evening,
    },
  });
}


export async function getDoctorUpcomingAppointments(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');
  // Get all upcoming appointments (scheduled or arrived, etc)
  const { rows } = await pool.query(
    `SELECT 
       a.id AS "appointmentId", 
       a.scheduled_start AS "scheduledStart",
       a.status,
       a.purpose,
       a.patient_id AS "patientId",
       p.name, 
       p.phone, 
       p.profile_image_url AS "profileImageUrl"
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.user_account_id
     WHERE a.doctor_id = $1 AND a.status IN ('scheduled', 'arrived', 'rescheduled')
     ORDER BY a.scheduled_start ASC`,
    [doctorId]
  );

  res.json({
    status: 'success',
    data: rows
  });
}

export async function getDoctorPatients(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');
  // Get unique patients that have an appointment with this doctor
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (p.id) 
       p.user_account_id AS id, 
       p.name, 
       p.phone, 
       p.gender, 
       p.date_of_birth AS "dob", 
       p.blood_group AS "bloodGroup", 
       p.profile_image_url AS "profileImageUrl",
       p.is_active AS "isActive",
       SUBSTRING(p.id::text, 1, 6) AS "shortId",
       a.scheduled_start AS "lastVisit"
     FROM patients p
     JOIN appointments a ON a.patient_id = p.user_account_id
     WHERE a.doctor_id = $1
     ORDER BY p.id, a.scheduled_start DESC`,
    [doctorId]
  );

  res.json({
    status: 'success',
    data: rows
  });
}

export async function getFollowupPatients(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');

  // Query follow-ups from prescriptions where follow_up_date is configured
  const { rows } = await pool.query(
    `SELECT 
       pr.id AS "prescriptionId",
       COALESCE(p.user_account_id, p.id) AS id,
       p.id AS "patientId",
       p.name,
       p.phone,
       p.gender,
       p.date_of_birth AS "dob",
       p.blood_group AS "bloodGroup",
       p.profile_image_url AS "profileImageUrl",
       pr.follow_up_date AS "followUpDate",
       pr.follow_up_days AS "followUpDays",
       COALESCE(pr.follow_up_status, 'pending') AS "followUpStatus",
       pr.follow_up_reminder_sent_at AS "lastReminderSentAt",
       pr.prescription_date AS "lastVisit",
       pr.additional_notes AS "diagnosis",
       ba.id AS "bookedAppointmentId",
       ba.scheduled_start AS "bookedDate",
       ba.status AS "bookedStatus"
     FROM prescriptions pr
     JOIN patients p ON (pr.patient_id = p.id OR pr.patient_id = p.user_account_id)
     LEFT JOIN appointments ba ON pr.follow_up_booked_appointment_id = ba.id
     WHERE pr.doctor_id = $1 AND pr.follow_up_date IS NOT NULL
     ORDER BY pr.follow_up_date ASC, pr.created_at DESC`,
    [doctorId]
  );

  let result = rows;
  if (result.length === 0) {
    const fallbackRes = await pool.query(
      `SELECT DISTINCT ON (p.id) 
         p.user_account_id AS id, 
         p.id AS "patientId",
         p.name, 
         p.phone, 
         p.gender, 
         p.date_of_birth AS "dob", 
         p.blood_group AS "bloodGroup", 
         p.profile_image_url AS "profileImageUrl",
         a.scheduled_start AS "lastVisit",
         a.scheduled_start AS "followUpDate",
         'booked' AS "followUpStatus",
         a.purpose
       FROM patients p
       JOIN appointments a ON (a.patient_id = p.user_account_id OR a.patient_id = p.id)
       WHERE a.doctor_id = $1 AND a.purpose ILIKE '%Follow-up%'
       ORDER BY p.id, a.scheduled_start DESC`,
      [doctorId]
    );
    result = fallbackRes.rows;
  }

  res.json({
    status: 'success',
    data: result
  });
}

export async function resendFollowupReminder(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { prescriptionId } = req.body as { prescriptionId: string };
  if (!prescriptionId) {
    res.status(400).json({ error: 'prescriptionId is required' });
    return;
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');
  const prescRes = await pool.query(
    `SELECT 
       pr.id, pr.patient_id, pr.follow_up_date, pr.follow_up_days, pr.follow_up_status,
       d.name AS doctor_name, d.branch_id,
       b.name AS branch_name
     FROM prescriptions pr
     JOIN doctors d ON pr.doctor_id = d.id
     LEFT JOIN hospital_branches b ON d.branch_id = b.id
     WHERE pr.id = $1 AND pr.doctor_id = $2`,
    [prescriptionId, doctorId]
  );

  if (prescRes.rows.length === 0) {
    res.status(404).json({ error: 'Prescription follow-up record not found' });
    return;
  }

  const rx = prescRes.rows[0];
  const formattedDate = rx.follow_up_date
    ? new Date(rx.follow_up_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'scheduled date';

  const doctorName = rx.doctor_name || 'Dr. Narendran';
  const branchName = rx.branch_name || 'Clinic';
  const branchId = rx.branch_id || '';

  // Dispatch reminder notification to patient
  await notificationService.sendToPatient(rx.patient_id, {
    type: NotificationType.FOLLOW_UP_REMINDER,
    title: '🗓️ Follow-up Reminder',
    body: `Dr. ${doctorName} scheduled your follow-up checkup on ${formattedDate}`,
    entityType: 'FOLLOW_UP',
    entityId: rx.id,
    route: 'BookAppointment',
    data: {
      prescriptionId: rx.id,
      doctorId: String(doctorId),
      doctorName,
      branchId: branchId ? String(branchId) : '',
      branchName,
      targetDate: rx.follow_up_date ? new Date(rx.follow_up_date).toISOString().split('T')[0] : '',
      purpose: 'Follow-up Consultation',
    },
  });

  // Update last reminder sent timestamp
  await pool.query(
    `UPDATE prescriptions SET follow_up_reminder_sent_at = NOW() WHERE id = $1`,
    [rx.id]
  );

  res.json({
    status: 'success',
    message: 'Follow-up reminder sent successfully',
    data: {
      prescriptionId: rx.id,
      remindedAt: new Date().toISOString(),
    },
  });
}

export async function getPatientAppointmentsForDoctor(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { patientId } = req.params;
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');
  const { rows } = await pool.query(
    `SELECT 
       a.id,
       a.scheduled_start AS "scheduledStart",
       a.scheduled_end AS "scheduledEnd",
       a.status,
       a.purpose,
       a.consultation_notes AS "consultationNotes",
       a.created_at AS "createdAt"
     FROM appointments a
     WHERE a.doctor_id = $1 AND a.patient_id = $2
     ORDER BY a.scheduled_start DESC`,
    [doctorId, patientId]
  );

  res.json({
    status: 'success',
    data: rows
  });
}

export async function getPatientTimeline(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { patientId } = req.params;
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');

  // 1. Fetch appointments
  const { rows: appts } = await pool.query(
    `SELECT 
       a.id,
       a.scheduled_start AS "scheduledStart",
       a.scheduled_end AS "scheduledEnd",
       a.status,
       a.purpose,
       a.consultation_notes AS "consultationNotes",
       a.created_at AS "createdAt"
     FROM appointments a
     WHERE a.doctor_id = $1 AND a.patient_id = $2
     ORDER BY a.scheduled_start DESC`,
    [doctorId, patientId]
  );

  // 2. Fetch prescriptions
  const { rows: rxRows } = await pool.query(
    `SELECT 
       p.id,
       p.appointment_id AS "appointmentId",
       p.additional_notes AS "notes",
       p.created_at AS "createdAt",
       json_agg(
         json_build_object(
           'name', pm.medicine_name,
           'dosage', pm.dosage,
           'frequency', pm.frequency
         )
       ) FILTER (WHERE pm.id IS NOT NULL) AS "medicines"
     FROM prescriptions p
     LEFT JOIN prescription_medicines pm ON pm.prescription_id = p.id
     WHERE p.appointment_id IN (
       SELECT id FROM appointments WHERE patient_id = $1
     )
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [patientId]
  );

  // 3. Fetch prescribed lab tests and their reports
  const { rows: labRows } = await pool.query(
    `SELECT 
       plt.id AS "prescribedTestId",
       plt.prescription_id AS "prescriptionId",
       plt.test_name AS "testName",
       CASE WHEN ltr.id IS NOT NULL THEN 'completed' ELSE 'prescribed' END AS "status",
       p.appointment_id AS "appointmentId",
       ltr.id AS "reportId",
       ltr.document_url AS "reportUrl",
       ltr.file_name AS "fileName",
       ltr.file_type AS "fileType",
       COALESCE(ltr.report_date::timestamp, plt.created_at) AS "date"
     FROM prescription_lab_tests plt
     LEFT JOIN prescriptions p ON p.id = plt.prescription_id
     LEFT JOIN lab_test_reports ltr ON ltr.prescription_lab_test_id = plt.id
     WHERE plt.patient_id = $1 OR p.patient_id = $1`,
    [patientId]
  );

  // 4. Fetch external lab reports
  const { rows: externalLabRows } = await pool.query(
    `SELECT 
       id AS "reportId",
       test_name AS "testName",
       document_url AS "reportUrl",
       file_name AS "fileName",
       file_type AS "fileType",
       report_date AS "date",
       'completed' AS "status"
     FROM lab_test_reports
     WHERE patient_id = $1 AND (prescription_lab_test_id IS NULL OR is_external = true)`,
    [patientId]
  );

  // 5. Assemble timeline
  const timeline = appts.map(appt => {
    const rx = rxRows.filter(r => r.appointmentId === appt.id);
    const labs = labRows.filter(l => l.appointmentId === appt.id).map(l => ({
      id: l.reportId || l.prescribedTestId,
      testName: l.testName,
      reportUrl: l.reportUrl,
      fileName: l.fileName,
      fileType: l.fileType,
      date: l.date,
      status: l.status
    }));

    return {
      ...appt,
      prescriptions: rx,
      labRecords: labs
    };
  });

  // Include external reports as independent timeline nodes
  const externalNodes = externalLabRows.map(ext => ({
    id: ext.reportId,
    scheduledStart: ext.date,
    status: 'completed',
    purpose: 'External Lab Report',
    labRecords: [{
      id: ext.reportId,
      testName: ext.testName,
      reportUrl: ext.reportUrl,
      fileName: ext.fileName,
      fileType: ext.fileType,
      date: ext.date,
      status: 'completed'
    }]
  }));

  const fullTimeline = [...timeline, ...externalNodes].sort((a, b) => {
    return new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime();
  });

  res.json({
    status: 'success',
    data: fullTimeline
  });
}

export type GetSlotsInput = ValidatedData<{ query: typeof getSlotsQuerySchema }>;
export type CreateAppointmentInput = ValidatedData<{
  body: typeof createAppointmentSchema;
}>;
export type DoctorBookAppointmentInput = ValidatedData<{
  body: typeof doctorBookAppointmentSchema;
}>;
export type RescheduleAppointmentInput = ValidatedData<{
  body: typeof rescheduleAppointmentSchema;
}>;
export type DoctorBulkRescheduleInput = ValidatedData<{
  body: typeof doctorBulkRescheduleSchema;
}>;
export type CancelAppointmentInput = ValidatedData<{
  body: typeof cancelAppointmentSchema;
}>;

// PATCH /appointments/:id/complete — mark appointment as completed and save notes
export async function markComplete(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required.');
  const { id } = req.params as { id: string };
  const { consultationNotes } = req.body as { consultationNotes?: string };

  const { pool } = await import('@/db/pool.js');
  const { rows } = await pool.query(
    `UPDATE appointments
        SET status = 'completed',
            consultation_notes = COALESCE($2, consultation_notes),
            updated_at = NOW()
      WHERE id = $1
  RETURNING id, status, consultation_notes AS "consultationNotes"`,
    [id, consultationNotes ?? null],
  );

  if (rows.length === 0) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  // Cancel pending reminders for completed appointment
  try {
    const { appointmentReminderService } = await import('./appointmentReminder.service.js');
    void appointmentReminderService.cancelRemindersForAppointment(id).catch(err => {
      console.warn('[ReminderService] Failed to cancel reminders for completed appointment:', err);
    });
  } catch (err) {
    console.warn('[ReminderService] Failed to import appointmentReminderService:', err);
  }

  // Asynchronously send push notification to patient on consultation completion
  try {
    const patientLookup = await pool.query(
      `SELECT 
         a.id,
         COALESCE(p.user_account_id, p.user_id, a.patient_id) AS "patientUserId",
         COALESCE(p.name, a.patient_name, 'Patient') AS "patientName",
         COALESCE(d.name, 'Dr. Narendran') AS "doctorName"
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       LEFT JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = $1`,
      [id],
    );

    const targetPatient = patientLookup.rows[0];
    const targetUserId = targetPatient?.patientUserId;

    if (targetUserId) {
      const { notificationService } = await import('@/modules/notifications/notification.service.js');
      const doctorName = targetPatient?.doctorName || 'Dr. Narendran';

      void notificationService.sendToUser(targetUserId, {
        type: 'APPOINTMENT_COMPLETED',
        title: 'Consultation Completed',
        body: `Your consultation with ${doctorName} is completed. View visit summary and prescriptions.`,
        entityType: 'APPOINTMENT',
        entityId: id,
        route: 'AppointmentDetail',
        idempotencyKey: `appt_complete:${id}`,
        data: {
          appointmentId: id,
          screen: 'AppointmentDetail',
          type: 'APPOINTMENT_COMPLETED',
        },
      }).catch((notifErr: unknown) => {
        console.warn('[FCM] Failed to dispatch consultation completed notification to patient:', notifErr);
      });
    }
  } catch (err) {
    console.warn('[FCM] Error looking up patient for completion notification:', err);
  }

  res.json({ status: 'success', data: rows[0] });
}

// POST /appointments/:id/prescription — save a prescription for an appointment
export async function savePrescription(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required.');
  const { id: appointmentId } = req.params as { id: string };

  const {
    patientId,
    diagnosis,
    generalInstructions,
    medicines,
    labTests,
    prescriptionType,
    imageUrl,
    followUpDays,
    followUpDate,
  } = req.body as {
    patientId?: string;
    diagnosis?: string;
    generalInstructions?: string;
    prescriptionType?: 'system' | 'upload';
    imageUrl?: string;
    followUpDays?: number | string;
    followUpDate?: string;
    medicines?: {
      name: string;
      medicineId?: string;
      strength?: string;
      dosage: string;
      frequency: string;
      duration: string;
      mealTiming: string;      // maps to food_instruction column
      instructions?: string;
      prescribedQuantity?: number;
    }[];
    labTests?: {
      labTestId?: string;
      testName: string;
      instructions?: string;
      labId?: string;
      lab_id?: string;
    }[];
  };

  const isUpload = prescriptionType === 'upload';

  if (!isUpload && !medicines?.length && !labTests?.length) {
    res.status(400).json({ error: 'At least one medicine or lab test is required for system prescriptions' });
    return;
  }
  if (isUpload && !imageUrl) {
    res.status(400).json({ error: 'Image URL is required for upload prescriptions' });
    return;
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);

  const { pool } = await import('@/db/pool.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve patient_id from appointment if not supplied
    let resolvedPatientId = patientId;
    if (!resolvedPatientId) {
      const apptRes = await client.query(
        'SELECT patient_id FROM appointments WHERE id = $1',
        [appointmentId],
      );
      resolvedPatientId = apptRes.rows[0]?.patient_id ?? null;
    }

    const bodyObj = req.body as Record<string, any>;
    let finalPrescriptionUrl = bodyObj?.['prescription_url'] || bodyObj?.['prescriptionUrl'] || imageUrl || null;

    let calculatedFollowUpDate: string | null = null;
    let followUpDaysNum: number | null = null;
    if (followUpDays !== undefined && followUpDays !== null && Number(followUpDays) > 0) {
      followUpDaysNum = Number(followUpDays);
      const d = new Date();
      d.setDate(d.getDate() + followUpDaysNum);
      calculatedFollowUpDate = d.toISOString().split('T')[0] ?? null;
    } else if (followUpDate) {
      const parsedDate = new Date(followUpDate);
      calculatedFollowUpDate = parsedDate.toISOString().split('T')[0] ?? null;
      const diffMs = parsedDate.getTime() - new Date().setHours(0, 0, 0, 0);
      followUpDaysNum = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Query appointment & party metadata for PDF and notifications
    let meta: any = {};
    try {
      const metaRes = await client.query(
        `SELECT 
           p.name AS patient_name,
           p.phone AS patient_phone,
           p.gender AS patient_gender,
           p.date_of_birth AS patient_dob,
           d.name AS doctor_name,
           d.qualification AS doctor_qualification,
           d.specialization AS doctor_specialization,
           d.medical_registration_number AS doctor_reg_no,
           d.phone AS doctor_phone,
           d.email AS doctor_email,
           d.clinic_address AS doctor_clinic_address,
           d.branch_id AS branch_id,
           h.name AS hospital_name,
           h.address AS hospital_address,
           h.phone AS hospital_phone,
           b.name AS branch_name,
           b.address AS branch_address,
           b.phone AS branch_phone
         FROM appointments a
         LEFT JOIN patients p ON a.patient_id = p.id
         LEFT JOIN doctors d ON a.doctor_id = d.id
         LEFT JOIN hospitals h ON d.hospital_id = h.id
         LEFT JOIN hospital_branches b ON d.branch_id = b.id
         WHERE a.id = $1`,
        [appointmentId],
      );
      meta = metaRes.rows[0] || {};
    } catch (metaErr) {
      logger.warn({ err: metaErr }, 'Failed to query appointment metadata for prescription');
    }

    let generatedPdfBuffer: Buffer | null = null;
    if (!isUpload && !finalPrescriptionUrl) {
      try {
        const { PrescriptionTemplatesService } = await import('@/modules/prescription_templates/prescription_templates.service.js');
        const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate();

        let labDetailsMap: Record<string, any> = {};
        const labIds = (labTests || []).map((l: any) => l.labId || l.lab_id).filter(Boolean);
        if (labIds.length > 0) {
          const labsInfoRes = await client.query(
            `SELECT id, name, city, phone, email,
                    CONCAT_WS(', ', NULLIF(address_line_1, ''), NULLIF(address_line_2, ''), NULLIF(city, '')) as address
             FROM labs WHERE id = ANY($1::uuid[])`,
            [labIds],
          );
          for (const row of labsInfoRes.rows) {
            labDetailsMap[row.id] = row;
          }
        }

        const dataContext = {
          hospital: {
            name: meta.hospital_name || 'Dr. Narendran Care Center',
            address: meta.hospital_address || '',
            phone: meta.hospital_phone || '+91 44 2829 0000',
            email: meta.hospital_email || '',
          },
          branch: {
            name: meta.branch_name || '',
            address: meta.branch_address || '',
            phone: meta.branch_phone || '',
          },
          doctor: {
            name: meta.doctor_name || 'Dr. Narendran',
            qualification: meta.doctor_qualification || 'MBBS, MD',
            specialization: meta.doctor_specialization || 'General Medicine',
            medical_registration_number: meta.doctor_reg_no || '',
            phone: meta.doctor_phone || '',
            email: meta.doctor_email || '',
            clinic_address: meta.doctor_clinic_address || '',
          },
          patient: {
            name: meta.patient_name || 'Patient',
            patient_id: resolvedPatientId ? String(resolvedPatientId).slice(0, 8).toUpperCase() : '',
            phone: meta.patient_phone || '',
            gender: meta.patient_gender || '',
            date_of_birth: meta.patient_dob ? new Date(meta.patient_dob).toLocaleDateString('en-GB') : '',
          },
          prescription: {
            prescription_date: new Date().toISOString(),
            appointment_id: appointmentId,
            diagnosis: diagnosis || '',
            additional_notes: generalInstructions || diagnosis || '',
            follow_up_days: followUpDaysNum,
            follow_up_date: calculatedFollowUpDate,
            medicines: medicines?.map((m) => ({
              name: m.name,
              dosage: m.dosage,
              strength: m.strength,
              frequency: m.frequency,
              duration: m.duration,
              mealTiming: m.mealTiming,
              instructions: m.instructions,
            })),
            lab_tests: labTests?.map((l: any) => {
              const assignedLab = (l.labId || l.lab_id) ? labDetailsMap[l.labId || l.lab_id] : null;
              return {
                testName: l.testName,
                instructions: l.instructions,
                lab_id: l.labId || l.lab_id || null,
                lab_name: assignedLab?.name || null,
                lab_city: assignedLab?.city || null,
                lab_address: assignedLab?.address || null,
                lab_phone: assignedLab?.phone || null,
              };
            }),
          },
        };

        const resolvedHtml = PrescriptionTemplatesService.resolveTemplate(activeTemplate.html_content, dataContext);
        generatedPdfBuffer = await PrescriptionTemplatesService.generatePdfBuffer(resolvedHtml);

        const { s3Service } = await import('@/modules/s3/s3.service.js');
        const key = `prescriptions/${doctorId}/presc_${Date.now()}.pdf`;
        const uploadResult = await s3Service.uploadBuffer(key, generatedPdfBuffer, 'application/pdf');
        // Generate pre-signed URL (7 days = 604800s) so anyone with the link can view without AccessDenied
        const signedUrl = await s3Service.getReadUrl(key, 604800);
        finalPrescriptionUrl = signedUrl || uploadResult.fileUrl;
      } catch (uploadErr: any) {
        logger.error({ err: uploadErr }, 'Failed to generate / upload prescription PDF to AWS S3');
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Unable to upload prescription. Please try again.' });
        return;
      }
    }

    // Insert prescription header into the existing `prescriptions` table with follow-up columns
    const prescRes = await client.query(
      `INSERT INTO prescriptions
          (patient_id, doctor_id, appointment_id, prescription_date, status, additional_notes, prescription_type, image_url, prescription_url, follow_up_days, follow_up_date, follow_up_status)
        VALUES ($1, $2, $3, CURRENT_DATE, 'active', $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, prescription_url`,
      [
        resolvedPatientId,
        doctorId,
        appointmentId,
        diagnosis ?? generalInstructions ?? null,
        prescriptionType ?? 'system',
        imageUrl ?? null,
        finalPrescriptionUrl,
        followUpDaysNum,
        calculatedFollowUpDate,
        calculatedFollowUpDate ? 'pending' : null,
      ],
    );
    const prescriptionId: string = prescRes.rows[0].id;

    // Insert each medicine into the existing `prescription_medicines` table
    if (medicines) {
      for (const med of medicines) {
        await client.query(
          `INSERT INTO prescription_medicines
              (prescription_id, medicine_id, medicine_name, strength, dosage, frequency, duration,
               food_instruction, instructions, prescribed_quantity)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            prescriptionId,
            med.medicineId ?? null,
            med.name,
            med.strength ?? null,
            med.dosage,
            med.frequency,
            med.duration,
            med.mealTiming,           // food_instruction
            med.instructions ?? null,
            med.prescribedQuantity ?? 1,
          ],
        );
      }
    }

    if (labTests) {
      for (const lab of labTests) {
        await client.query(
          `INSERT INTO prescription_lab_tests
              (prescription_id, patient_id, lab_test_id, test_name, instructions, lab_id)
            VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            prescriptionId,
            resolvedPatientId,   // ← now stored directly on the lab test row
            lab.labTestId ?? null,
            lab.testName,
            lab.instructions ?? null,
            lab.labId ?? lab.lab_id ?? null,
          ],
        );
      }
    }

    // Auto-generate medicine schedules for adherence tracking
    await medicineScheduleService.generateScheduleForPrescription(prescriptionId, client);

    await client.query('COMMIT');

    // Send automated referral emails to each assigned diagnostic lab via existing SMTP
    if (labTests && labTests.length > 0) {
      try {
        const { LabReferralEmailService } = await import('@/modules/labs/labReferralEmail.service.js');

        // Group recommended tests by labId
        const testsByLabId = new Map<string, Array<{ testName: string; instructions?: string | undefined }>>();
        for (const lt of labTests) {
          const lid = lt.labId || lt.lab_id;
          if (lid) {
            if (!testsByLabId.has(lid)) {
              testsByLabId.set(lid, []);
            }
            testsByLabId.get(lid)!.push({
              testName: lt.testName,
              instructions: lt.instructions,
            });
          }
        }

        if (testsByLabId.size > 0) {
          const uniqueLabIds = Array.from(testsByLabId.keys());
          const { pool } = await import('@/db/pool.js');
          const labsRes = await pool.query(
            `SELECT id, name, email, phone,
                    CONCAT_WS(', ', NULLIF(address_line_1, ''), NULLIF(address_line_2, ''), NULLIF(city, '')) as address
             FROM labs WHERE id = ANY($1::uuid[])`,
            [uniqueLabIds],
          );

          for (const labRow of labsRes.rows) {
            if (labRow.email && typeof labRow.email === 'string' && labRow.email.trim().length > 0) {
              const testsForThisLab = testsByLabId.get(labRow.id) || [];
              if (testsForThisLab.length > 0) {
                void LabReferralEmailService.sendReferralEmail({
                  lab: {
                    id: labRow.id,
                    name: labRow.name,
                    email: labRow.email,
                    phone: labRow.phone,
                    address: labRow.address,
                  },
                  hospital: {
                    name: meta.hospital_name || 'Dr. Narendran Care Center',
                    address: meta.hospital_address || '',
                    phone: meta.hospital_phone || '+91 44 2829 0000',
                    email: meta.hospital_email || '',
                  },
                  doctor: {
                    name: meta.doctor_name || 'Dr. Narendran',
                    qualification: meta.doctor_qualification || 'MBBS, MD',
                    specialization: meta.doctor_specialization || 'General Medicine',
                    medicalRegistrationNumber: meta.doctor_reg_no || '',
                    phone: meta.doctor_phone || '',
                  },
                  patient: {
                    name: meta.patient_name || 'Patient',
                    patientId: resolvedPatientId ? String(resolvedPatientId).slice(0, 8).toUpperCase() : '',
                    gender: meta.patient_gender || '',
                    ageOrDob: meta.patient_dob ? new Date(meta.patient_dob).toLocaleDateString('en-GB') : '',
                    phone: meta.patient_phone || '',
                  },
                  prescription: {
                    prescriptionId,
                    prescriptionDate: new Date().toISOString(),
                    diagnosis: diagnosis || generalInstructions || '',
                    additionalNotes: generalInstructions || '',
                    prescriptionUrl: finalPrescriptionUrl,
                  },
                  recommendedTests: testsForThisLab,
                  pdfBuffer: generatedPdfBuffer ?? undefined,
                }).catch((emailErr) => {
                  logger.warn({ err: emailErr, labId: labRow.id }, 'Failed to dispatch lab referral email');
                });
              }
            } else {
              logger.info(
                { labId: labRow.id, labName: labRow.name },
                'Lab has no registered email; referral email skipped',
              );
            }
          }
        }
      } catch (labEmailErr) {
        logger.warn({ err: labEmailErr }, 'Error processing lab referral emails in savePrescription');
      }
    }

    // Instant notification to patient when follow-up is scheduled
    if (calculatedFollowUpDate && resolvedPatientId) {
      try {
        const formattedDate = new Date(calculatedFollowUpDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const doctorName = meta?.doctor_name || 'Dr. Narendran';
        const branchName = meta?.branch_name || 'Clinic';
        const branchId = meta?.branch_id || '';

        void notificationService.sendToPatient(resolvedPatientId, {
          type: NotificationType.FOLLOW_UP_REMINDER,
          title: '🗓️ Follow-up Reminder',
          body: `Dr. ${doctorName} scheduled your follow-up checkup on ${formattedDate}`,
          entityType: 'FOLLOW_UP',
          entityId: prescriptionId,
          route: 'BookAppointment',
          data: {
            prescriptionId,
            doctorId: doctorId ? String(doctorId) : '',
            doctorName,
            branchId: branchId ? String(branchId) : '',
            branchName,
            targetDate: calculatedFollowUpDate,
            purpose: 'Follow-up Consultation',
          },
        }).catch((err) => {
          logger.warn({ err }, 'Failed to dispatch follow-up notification to patient');
        });
      } catch (notifErr) {
        logger.warn({ notifErr }, 'Error preparing follow-up notification');
      }
    }

    // Notify patient about newly issued or revised prescription (post-commit, fire-and-forget)
    try {
      const { notificationService } = await import('@/modules/notifications/notification.service.js');
      if (resolvedPatientId) {
        // Detect whether a prior prescription existed for this appointment
        const priorRx = await pool.query(
          `SELECT id FROM prescriptions WHERE appointment_id = $1 AND id <> $2 LIMIT 1`,
          [appointmentId, prescriptionId],
        );
        const isRevision = priorRx.rows.length > 0;
        const notifType = isRevision ? 'PRESCRIPTION_REVISED' : 'PRESCRIPTION_CREATED';
        const notifTitle = isRevision ? 'Prescription Updated' : 'New Prescription Available';
        const notifBody = isRevision
          ? 'Your doctor has updated your prescription.'
          : 'Your doctor has issued a new prescription.';

        void notificationService.sendToPatient(resolvedPatientId, {
          type: notifType as any,
          title: notifTitle,
          body: notifBody,
          entityType: 'PRESCRIPTION',
          entityId: prescriptionId,
          route: 'Prescriptions',
          idempotencyKey: isRevision
            ? `rx_revised:${appointmentId}:${prescriptionId}`
            : `rx_created:${appointmentId}:${prescriptionId}`,
          data: {
            prescriptionId,
            appointmentId: appointmentId || '',
            screen: 'PrescriptionDetails',
          },
        }).catch((e) => logger.warn({ error: e }, 'Failed to send prescription push notification to patient'));
      }
    } catch (notifErr) {
      logger.warn({ error: notifErr }, 'Failed to initialize notificationService for prescription');
    }

    res.status(201).json({
      status: 'success',
      data: {
        prescriptionId,
        prescription_url: finalPrescriptionUrl,
        follow_up_date: calculatedFollowUpDate,
        follow_up_days: followUpDaysNum,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPatientPrescriptions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required.');

  const { id: appointmentId } = req.params;

  if (!appointmentId) {
    res.status(400).json({ error: 'Appointment ID is required' });
    return;
  }

  const { pool } = await import('@/db/pool.js');

  // Allow an explicit patientId via query param; otherwise resolve from the appointment
  let patientId = req.query['patientId'] as string | undefined;

  if (!patientId) {
    const apptRes = await pool.query(
      'SELECT patient_id FROM appointments WHERE id = $1',
      [appointmentId],
    );
    if (apptRes.rows.length === 0 || !apptRes.rows[0].patient_id) {
      res.status(200).json({ status: 'success', data: [] });
      return;
    }
    patientId = apptRes.rows[0].patient_id as string;
  }

  // Fetch all prescriptions for THIS specific patient only.
  // patient_id IS NOT NULL ensures orphaned legacy records are excluded.
  const prescRes = await pool.query(
    `SELECT
         p.id, p.prescription_date, p.status, p.additional_notes AS diagnosis,
         p.appointment_id, p.prescription_type, p.image_url, p.prescription_url
       FROM prescriptions p
       WHERE p.patient_id = $1
         AND p.patient_id IS NOT NULL
       ORDER BY p.prescription_date DESC, p.created_at DESC`,
    [patientId],
  );

  const prescriptions = prescRes.rows;
  if (prescriptions.length === 0) {
    res.status(200).json({ status: 'success', data: [] });
    return;
  }

  const pIds = prescriptions.map((p) => p.id);
  const medsRes = await pool.query(
    `SELECT
         pm.prescription_id, pm.medicine_id as "medicineId", pm.medicine_name as name, pm.strength,
         pm.dosage, pm.frequency, pm.duration, pm.food_instruction as "mealTiming",
         pm.instructions, pm.prescribed_quantity as "prescribedQuantity",
         m.generic_name as "genericName", m.manufacturer, m.mrp, m.discount_type as "discountType", m.discount_value as "discountValue", m.final_price as "finalPrice", m.barcode,
         m.therapeutic_category as "therapeuticCategory", m.sub_category as "subCategory"
       FROM prescription_medicines pm
       LEFT JOIN medicines m ON pm.medicine_id = m.id
       WHERE pm.prescription_id = ANY($1)`,
    [pIds],
  );

  const medsByPrescription = medsRes.rows.reduce((acc: any, med: any) => {
    if (!acc[med.prescription_id]) acc[med.prescription_id] = [];
    acc[med.prescription_id].push(med);
    return acc;
  }, {});

  const labsRes = await pool.query(
    `SELECT
         pl.prescription_id, pl.lab_test_id as "labTestId", pl.test_name as "testName", pl.instructions,
         pl.lab_id as "labId",
         lab.name as "labName", lab.phone as "labPhone",
         CONCAT_WS(', ', NULLIF(lab.address_line_1, ''), NULLIF(lab.address_line_2, ''), NULLIF(lab.city, '')) as "labAddress",
         lab.city as "labCity", lab.map_link as "labMapLink",
         l.test_type as "testType", l.description, l.price, l.status
       FROM prescription_lab_tests pl
       LEFT JOIN lab_tests l ON pl.lab_test_id = l.id
       LEFT JOIN labs lab ON pl.lab_id = lab.id
       WHERE pl.prescription_id = ANY($1)`,
    [pIds],
  );

  const labsByPrescription = labsRes.rows.reduce((acc: any, lab: any) => {
    if (!acc[lab.prescription_id]) acc[lab.prescription_id] = [];
    acc[lab.prescription_id].push(lab);
    return acc;
  }, {});

  const formatted = prescriptions.map((p) => ({
    id: p.id,
    date: new Date(p.prescription_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    diagnosis: p.diagnosis || 'General Consultation',
    status: p.status,
    sentVia: 'SMS & Email',
    prescriptionType: p.prescription_type,
    imageUrl: p.image_url,
    prescriptionUrl: p.prescription_url,
    prescription_url: p.prescription_url,
    meds: medsByPrescription[p.id] || [],
    labTests: labsByPrescription[p.id] || [],
  }));

  res.status(200).json({ status: 'success', data: formatted });
}

export async function getDoctor(_req: Request, res: Response): Promise<void> {
  const doctor = await service.getDoctorInfo();
  res.status(200).json({ status: 'success', data: doctor });
}

export async function getSlots(
  input: GetSlotsInput,
  _req: Request,
  res: Response,
): Promise<void> {
  const { startDate, days, doctorId, doctor_id, locationId, location_id } = input.query as any;
  const rawLoc = locationId ?? location_id;
  const normalizedLocationId =
    rawLoc === undefined ||
    rawLoc === null ||
    rawLoc === 'null' ||
    rawLoc === 'none' ||
    rawLoc === 'undefined' ||
    rawLoc === ''
      ? null
      : String(rawLoc);

  const data = await service.getSlots(
    startDate,
    days,
    doctorId || doctor_id,
    normalizedLocationId,
  );
  res.status(200).json({ status: 'success', data });
}

export async function createAppointment(
  input: CreateAppointmentInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const appointment = await service.createAppointment(req.user.id, input.body, req.user.role);
  res.status(201).json({ status: 'success', data: appointment });
}

export async function doctorBookAppointment(
  input: DoctorBookAppointmentInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(403).json({ error: 'Only doctors can book follow-ups directly' });
    return;
  }

  const { patientId, slotId, purpose } = input.body;
  try {
    const appointment = await service.createAppointment(
      patientId,
      {
        slotId,
        purpose,
        doctorId,
      },
      'doctor',
    );
    res.status(201).json({ status: 'success', data: appointment });
  } catch (err: any) {
    console.error('Error in doctorBookAppointment:', err);
    res.status(err.statusCode || 500).json({
      status: 'error',
      message: err.message || 'Failed to book appointment',
    });
  }
}

export async function getMyAppointments(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const tab = (req.query['tab'] as 'upcoming' | 'history') || 'upcoming';
  const appointments = await service.getMyAppointments(req.user.id, tab);
  res.status(200).json({ status: 'success', data: appointments });
}

export async function getPendingRescheduleRequests(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const requests = await service.getPendingRescheduleRequests(req.user.id);
  res.status(200).json({ status: 'success', count: requests.length, data: requests });
}

export async function getPendingRescheduleRequestsCount(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const count = await service.getPendingRescheduleRequestsCount(req.user.id);
  res.status(200).json({ status: 'success', count });
}

export async function getDoctorRescheduleRequests(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const status = req.query['status'] as string | undefined;
  const requests = await service.getDoctorRescheduleRequests(req.user.id, status);
  res.status(200).json({ status: 'success', data: requests });
}

export async function sendRescheduleReminder(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const requestId = String(req.params['id']);
  const updated = await service.sendRescheduleReminder(requestId, req.user.id);
  res.status(200).json({
    status: 'success',
    message: 'Reschedule reminder sent to patient successfully',
    data: updated,
  });
}

export async function getAppointmentById(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const appointment = await service.getAppointmentById(idStr, req.user.id);
  res.status(200).json({ status: 'success', data: appointment });
}

export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const appointment = await service.rescheduleAppointment(
    idStr,
    req.user.id,
    input.body,
    req.user.role,
  );
  res.status(200).json({ status: 'success', data: appointment });
}

export async function createRescheduleRequest(
  input: CreateRescheduleRequestInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.createRescheduleRequest(
    idStr,
    req.user.id,
    input.body,
  );
  res.status(201).json({ status: 'success', data: result });
}

export async function getActiveRescheduleRequest(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.getActiveRescheduleRequest(idStr);
  res.status(200).json({ status: 'success', data: result });
}

export async function confirmRescheduleRequest(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.confirmRescheduleRequest(idStr, req.user.id);
  res.status(200).json({ status: 'success', data: result });
}

export async function declineRescheduleRequest(
  input: DeclineRescheduleRequestInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.declineRescheduleRequest(
    idStr,
    req.user.id,
    input.body?.reason,
  );
  res.status(200).json({ status: 'success', data: result });
}

export async function chooseAlternativeRescheduleSlot(
  input: ChooseAlternativeSlotInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.chooseAlternativeRescheduleSlot(
    idStr,
    req.user.id,
    input.body,
  );
  res.status(200).json({ status: 'success', data: result });
}

export async function withdrawRescheduleRequest(
  input: WithdrawRescheduleRequestInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const result = await service.withdrawRescheduleRequest(
    idStr,
    req.user.id,
    input.body?.reason,
  );
  res.status(200).json({ status: 'success', data: result });
}

export async function cancelAppointment(
  input: CancelAppointmentInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const idStr = String(req.params['id']);
  const { reason } = input.body;
  const appointment = await service.cancelAppointment(
    idStr,
    req.user.id,
    reason,
    req.user.role,
  );
  res.status(200).json({ status: 'success', data: appointment });
}



type UpdateInput = ValidatedData<{ body: typeof UpdateAvailabilitySchema }>;
type AddBlockedDateInput = ValidatedData<{ body: typeof AddBlockedDateSchema }>;

export async function getAvailability(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const locationId = req.query['location_id'] as string | undefined;
  const rules = await repo.getAvailabilityRules(doctorId, locationId);
  const slot_duration_minutes = rules[0]?.slot_duration_minutes ?? 30;

  res.json({ slot_duration_minutes, rules });
}

export async function updateAvailability(
  input: UpdateInput,
  req: Request,
  res: Response,
) {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const { location_id, slot_duration_minutes, rules } = input.body;
  await repo.upsertAvailabilityRules(doctorId, location_id, slot_duration_minutes, rules);
  res.json({ message: 'Availability rules updated successfully' });
}

import type { AddCustomAvailabilitySchema } from './appointments.schema.js';
type AddCustomAvailabilityInput = ValidatedData<{ body: typeof AddCustomAvailabilitySchema }>;

export async function getCustomAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const data = await repo.getCustomAvailability(doctorId);
  res.json({ status: 'success', data });
}

export async function addCustomAvailability(
  input: AddCustomAvailabilityInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { date, location_id, start_time, end_time } = input.body;
  const result = await repo.addCustomAvailability({
    doctorId,
    date,
    locationId: location_id,
    startTime: start_time,
    endTime: end_time,
  });

  res.status(201).json({ status: 'success', data: result });
}

import type { UpdateCustomAvailabilitySchema } from './appointments.schema.js';
type UpdateCustomAvailabilityInput = ValidatedData<{ body: typeof UpdateCustomAvailabilitySchema }>;

export async function updateCustomAvailability(
  input: UpdateCustomAvailabilityInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const id = req.params['id'] as string;
  if (!id) {
    res.status(400).json({ error: 'ID is required' });
    return;
  }

  const { date, location_id, start_time, end_time } = input.body;
  const result = await repo.updateCustomAvailability(id, {
    doctorId,
    date,
    locationId: location_id,
    startTime: start_time,
    endTime: end_time,
  });

  if (!result) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  res.json({ status: 'success', data: result });
}

export async function deleteCustomAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const id = req.params['id'] as string;
  if (!id) {
    res.status(400).json({ error: 'ID is required' });
    return;
  }

  const success = await repo.deleteCustomAvailability(id, doctorId);
  if (!success) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  res.json({ status: 'success', message: 'Record deleted' });
}

export async function getBlockedDates(_req: Request, res: Response): Promise<void> {
  const userId = _req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const dates = await repo.getBlockedDates(doctorId);
  res.json(dates);
}

export async function addBlockedDate(
  input: AddBlockedDateInput,
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const { blocked_date, start_time, end_time, reason } = input.body;
  const block = await repo.addBlockedDate(doctorId, blocked_date, start_time, end_time, reason);
  res.status(201).json(block);
}

import type { UpdateBlockedDateSchema } from './appointments.schema.js';
type UpdateBlockedDateInput = ValidatedData<{ body: typeof UpdateBlockedDateSchema }>;

export async function updateBlockedDate(
  input: UpdateBlockedDateInput,
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const id = req.params['id'] as string;
  if (!id) {
    res.status(400).json({ error: 'ID is required' });
    return;
  }

  const { blocked_date, start_time, end_time, reason } = input.body;
  const block = await repo.updateBlockedDate(doctorId, id, blocked_date, start_time, end_time, reason);

  if (!block) {
    res.status(404).json({ error: 'Blocked date not found' });
    return;
  }

  res.status(200).json(block);
}

export async function removeBlockedDate(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required.');

  const doctorId = await repo.getDoctorIdByUserId(userId);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor profile not found' });
    return;
  }

  const id = req.params['id'] as string;
  await repo.removeBlockedDate(doctorId, id);
  res.status(204).send();
}

export async function getUploadUrl(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const { contentType, fileName } = req.body as { contentType: string, fileName?: string };
  if (!contentType) {
    res.status(400).json({ error: 'contentType is required' });
    return;
  }

  const { s3Service } = await import('@/modules/s3/s3.service.js');
  const ext = contentType.split('/')[1] || 'jpeg';
  const name = fileName || `presc_${Date.now()}`;
  const key = `prescriptions/${req.user.id}/${name}.${ext}`;
  const result = await s3Service.getUploadUrl(key, contentType);

  res.status(200).json({ status: 'success', data: result });
}

export async function doctorBulkReschedule(
  input: DoctorBulkRescheduleInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const doctorId = await repo.getDoctorIdByUserId(req.user.id);
  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { appointmentIds, newDate, startTime, reason } = input.body;

  // We need to fetch slots for this date and this doctor.
  const summaries = await repo.getSlotsForDoctor(doctorId, newDate, 1);
  if (!summaries || summaries.length === 0) {
    res.status(400).json({ error: 'No slots available for this date' });
    return;
  }

  const daySummary = summaries[0];
  if (!daySummary) {
    res.status(400).json({ error: 'No slots available for this date' });
    return;
  }

  let availableSlots = daySummary.slots.filter(s => !s.isBooked);
  if (startTime) {
    // find index of the slot with this start time
    const idx = availableSlots.findIndex(s => s.slotTime === startTime);
    if (idx !== -1) {
      availableSlots = availableSlots.slice(idx);
    } else {
      res.status(400).json({ error: 'Selected time slot is not available' });
      return;
    }
  }

  if (availableSlots.length < appointmentIds.length) {
    res.status(400).json({ error: 'Not enough available slots for the selected appointments on this date' });
    return;
  }

  const { pool } = await import('@/db/pool.js');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pendingNotifications: Array<{
      targetUserId: string;
      apptId: string;
      newStart: Date;
    }> = [];

    // Assign slots to appointments sequentially
    for (let i = 0; i < appointmentIds.length; i++) {
      const apptId = appointmentIds[i];
      const slot = availableSlots[i];
      if (!slot) continue;

      const newStart = new Date(`${slot.slotTime}+05:30`);
      // Get the current appointment, matching doctor by doctorId or userId
      const checkRes = await client.query<{
        status: string;
        patient_id: string;
        patient_name: string | null;
      }>(
        `SELECT status, patient_id, patient_name
         FROM appointments
         WHERE id = $1 AND (doctor_id = $2 OR doctor_id = $3)
         FOR UPDATE`,
        [apptId, doctorId, req.user.id],
      );
      if (checkRes.rowCount === 0) {
        throw new Error(`Appointment ${apptId} not found or does not belong to you`);
      }
      const appt = checkRes.rows[0]!;
      if (appt.status === 'cancelled') {
        throw new Error(`Appointment ${apptId} is already cancelled`);
      }

      // Resolve patient's user_account_id for notification
      const userRes = await client.query<{ targetUserId: string }>(
        `SELECT COALESCE(user_account_id, id) AS "targetUserId"
         FROM patients
         WHERE id::text = $1 OR user_account_id::text = $1
         LIMIT 1`,
        [appt.patient_id],
      );
      const targetUserId = userRes.rows[0]?.targetUserId || appt.patient_id;

      const newEnd = new Date(newStart.getTime() + 25 * 60 * 1000);
      await client.query(
        `UPDATE appointments 
         SET slot_id = $1, scheduled_start = $2, scheduled_end = $3, status = 'rescheduled', reschedule_reason = $4, updated_at = NOW() 
         WHERE id = $5`,
        [slot.id, newStart.toISOString(), newEnd.toISOString(), reason ?? null, apptId]
      );

      await client.query(
        `INSERT INTO appointment_status_history (appointment_id, status, changed_by, notes) VALUES ($1, 'rescheduled', $2, $3)`,
        [apptId, doctorId, reason ?? 'Rescheduled by doctor in bulk update']
      );

      if (targetUserId) {
        pendingNotifications.push({
          targetUserId,
          apptId: String(apptId),
          newStart,
        });
      }
    }

    await client.query('COMMIT');

    // Notify affected patients about reschedule and update reminder schedules
    try {
      const { notificationService } = await import('@/modules/notifications/notification.service.js');
      const { NotificationType } = await import('@/modules/notifications/notification.types.js');
      const { appointmentReminderService } = await import('./appointmentReminder.service.js');
      const { formatAppointmentDateTime } = await import('./appointments.formatter.js');

      for (let i = 0; i < appointmentIds.length; i++) {
        const apptId = appointmentIds[i];
        const slot = availableSlots[i];
        if (!apptId || !slot) continue;
        const newStart = new Date(`${slot.slotTime}+05:30`);
        const { dateStr: bDate, timeStr: bTime } = formatAppointmentDateTime(newStart);

        const checkAppt = await pool.query('SELECT patient_id FROM appointments WHERE id = $1', [apptId]);
        const patientId = checkAppt.rows[0]?.patient_id;
        if (patientId) {
          void appointmentReminderService.rescheduleRemindersForAppointment({
            id: apptId,
            patientId,
            scheduledStart: newStart.toISOString(),
          }).catch(e => logger.warn({ error: e, appointmentId: apptId }, '[ReminderService] Failed to reschedule reminders in bulk'));

          void notificationService.sendToPatient(patientId, {
            type: NotificationType.APPOINTMENT_RESCHEDULED,
            title: 'Appointment Rescheduled',
            body: `Your appointment has been rescheduled to ${bDate} at ${bTime}.`,
            entityType: 'APPOINTMENT',
            entityId: apptId,
            route: 'AppointmentDetail',
            idempotencyKey: `bulk_resched:${apptId}:${newStart.toISOString()}`,
            data: {
              type: NotificationType.APPOINTMENT_RESCHEDULED,
              appointmentId: apptId,
              screen: 'AppointmentDetail',
            },
          }).catch((e) => logger.warn({ error: e, appointmentId: apptId }, '[FCM] Failed to send bulk reschedule push notification to patient'));
        }
      }
    } catch (notifErr) {
      logger.warn({ error: notifErr }, '[FCM] Failed to dispatch bulk reschedule push notifications');
    }

    res.status(200).json({ status: 'success', message: 'Appointments rescheduled successfully' });

    // Dispatch push notifications immediately without delaying database connection or client response
    for (const notif of pendingNotifications) {
      const dateFormatted = notif.newStart.toLocaleDateString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
      const timeFormatted = notif.newStart.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });

      void notificationService.sendToUser(notif.targetUserId, {
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: '🗓️ Appointment Rescheduled',
        body: `Your appointment with Dr. Narendran has been rescheduled to ${dateFormatted} at ${timeFormatted}.`,
        entityType: 'APPOINTMENT',
        entityId: notif.apptId,
        route: 'AppointmentDetail',
        data: {
          appointmentId: notif.apptId,
          date: dateFormatted,
          time: timeFormatted,
          status: 'rescheduled',
          scheduledStart: notif.newStart.toISOString(),
        },
      }).catch(e => console.warn('Failed to send reschedule notification to patient:', e));
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Failed to reschedule appointments' });
  } finally {
    client.release();
  }
}

export async function downloadPrescriptionPdf(req: Request, res: Response): Promise<void> {
  const { prescriptionId } = req.params;

  // 1. Fetch prescription and associated doctor, patient, hospital, branch data
  const pRes = await pool.query(
    `SELECT 
        p.*, 
        a.id as appt_id,
        a.scheduled_start,
        COALESCE(pat.name, pt.username) as patient_name,
        pat.phone as patient_phone,
        pat.gender as patient_gender,
        pat.date_of_birth as patient_dob,
        pat.blood_group as patient_blood_group,
        pat.id as pat_id,
        d.name as doctor_name,
        d.qualification as doctor_qualification,
        d.specialization as doctor_specialization,
        d.medical_registration_number as doctor_reg_no,
        d.phone as doctor_phone,
        d.email as doctor_email,
        d.clinic_address as doctor_clinic_address,
        h.name as hospital_name,
        h.address as hospital_address,
        h.phone as hospital_phone,
        h.email as hospital_email,
        hb.name as branch_name,
        hb.address as branch_address,
        hb.phone as branch_phone
     FROM prescriptions p
     JOIN appointments a ON p.appointment_id = a.id
     JOIN user_accounts pt ON a.patient_id = pt.id
     LEFT JOIN patients pat ON pat.user_account_id = pt.id
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN hospitals h ON d.hospital_id = h.id
     LEFT JOIN hospital_branches hb ON d.branch_id = hb.id
     WHERE p.id = $1`,
    [prescriptionId]
  );

  if (pRes.rowCount === 0) {
    res.status(404).send('Prescription not found');
    return;
  }

  const p = pRes.rows[0];
  let html: string;

  if (p.prescription_type === 'upload' && p.image_url) {
    let imageKey = p.image_url;
    if (imageKey.startsWith('http')) {
      try {
        const urlObj = new URL(imageKey);
        imageKey = decodeURIComponent(urlObj.pathname.substring(1));
      } catch {
        // Ignore malformed url
      }
    }

    const signedUrl = await s3Service.getReadUrl(imageKey, 3600);
    let imgSrc = signedUrl;
    try {
      const response = await fetch(signedUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        imgSrc = `data:${contentType};base64,${buffer.toString('base64')}`;
      } else {
        logger.error({ statusText: response.statusText }, 'Failed to fetch image for PDF');
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to fetch image for PDF');
    }

    html = `
      <html>
        <head><style>body{margin:0;padding:20px;display:flex;justify-content:center;} img{max-width:100%;}</style></head>
        <body><img src="${imgSrc}" /></body>
      </html>
    `;
  } else {
    // Generate unified HTML using active static HTML prescription template
    const medsRes = await pool.query(`SELECT * FROM prescription_medicines WHERE prescription_id = $1`, [p.id]);
    const labsRes = await pool.query(
      `SELECT pl.*, 
              lab.name as lab_name, 
              lab.phone as lab_phone,
              lab.city as lab_city,
              CONCAT_WS(', ', NULLIF(lab.address_line_1, ''), NULLIF(lab.address_line_2, ''), NULLIF(lab.city, '')) as lab_address,
              lab.map_link as lab_map_link,
              lab.start_time as lab_start_time,
              lab.end_time as lab_end_time
       FROM prescription_lab_tests pl
       LEFT JOIN labs lab ON pl.lab_id = lab.id
       WHERE pl.prescription_id = $1`,
      [p.id],
    );

    const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate();

    const dataContext = {
      hospital: {
        name: p.hospital_name || 'Dr. Narendran Care Center',
        address: p.hospital_address || '',
        phone: p.hospital_phone || '',
        email: p.hospital_email || '',
      },
      branch: {
        name: p.branch_name || '',
        address: p.branch_address || '',
        phone: p.branch_phone || '',
      },
      doctor: {
        name: p.doctor_name || '',
        qualification: p.doctor_qualification || '',
        specialization: p.doctor_specialization || '',
        medical_registration_number: p.doctor_reg_no || '',
        phone: p.doctor_phone || '',
        email: p.doctor_email || '',
        clinic_address: p.doctor_clinic_address || '',
      },
      patient: {
        name: p.patient_name || '',
        patient_id: p.patient_id ? String(p.patient_id).slice(0, 8).toUpperCase() : '',
        phone: p.patient_phone || '',
        gender: p.patient_gender || '',
        date_of_birth: p.patient_dob ? new Date(p.patient_dob).toLocaleDateString() : '',
      },
      prescription: {
        prescription_id: p.id ? String(p.id).slice(0, 8).toUpperCase() : '',
        prescription_date: p.prescription_date,
        diagnosis: p.additional_notes || '',
        additional_notes: p.additional_notes || '',
        medicines: medsRes.rows.map((m) => ({
          name: m.medicine_name,
          dosage: m.dosage,
          strength: m.strength,
          frequency: m.frequency,
          duration: m.duration,
          mealTiming: m.food_instruction,
          instructions: m.instructions,
        })),
        lab_tests: labsRes.rows.map((l) => ({
          testName: l.test_name,
          instructions: l.instructions,
          lab_id: l.lab_id,
          lab_name: l.lab_name,
          lab_phone: l.lab_phone,
          lab_address: l.lab_address,
          lab_city: l.lab_city,
          lab_map_link: l.lab_map_link,
          lab_timings: [l.lab_start_time, l.lab_end_time].filter(Boolean).join(' - '),
        })),
      },
    };

    html = PrescriptionTemplatesService.resolveTemplate(activeTemplate.html_content, dataContext);
  }

  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    const pIdStr = typeof prescriptionId === 'string' ? prescriptionId : String(prescriptionId ?? '');
    res.setHeader('Content-Disposition', `attachment; filename="prescription_${pIdStr}.pdf"`);
    res.send(pdf);
  } catch (error) {
    logger.error({ err: error }, 'PDF Generation Error');
    res.status(500).send('Failed to generate PDF');
  }
}


export async function downloadPrescriptionHtml(req: Request, res: Response): Promise<void> {
  const { prescriptionId } = req.params;
  // 1. Fetch prescription from database
  const pRes = await pool.query(
    `SELECT p.*, a.patient_id, 
            COALESCE(pat.name, pt.username) as patient_name, 
            d.name as doc_name,
            d.qualification, d.specialization,
            h.name as hospital_name, h.address as hospital_address, h.phone as hospital_phone,
            pat.gender, pat.date_of_birth, a.id as appointment_uuid
     FROM prescriptions p
     JOIN appointments a ON p.appointment_id = a.id
     JOIN user_accounts pt ON a.patient_id = pt.id
     LEFT JOIN patients pat ON pat.user_account_id = pt.id
     JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN hospitals h ON d.hospital_id = h.id
     WHERE p.id = $1`,
    [prescriptionId]
  );

  if (pRes.rowCount === 0) {
    res.status(404).send('Prescription not found');
    return;
  }

  const p = pRes.rows[0];
  let html = '';

  if (p.prescription_type === 'upload' && p.image_url) {
    let imageKey = p.image_url;
    if (imageKey.startsWith('http')) {
      try {
        const urlObj = new URL(imageKey);
        imageKey = decodeURIComponent(urlObj.pathname.substring(1));
      } catch (e) { }
    }

    const signedUrl = await s3Service.getReadUrl(imageKey, 3600);

    html = `
      <html>
        <head><style>body{margin:0;padding:20px;display:flex;justify-content:center;} img{max-width:100%;}</style></head>
        <body><img src="${signedUrl}" /></body>
      </html>
    `;
  } else {
    const medsRes = await pool.query(`SELECT * FROM prescription_medicines WHERE prescription_id = $1`, [p.id]);
    const labsRes = await pool.query(
      `SELECT pl.*, 
              lab.name as lab_name, 
              lab.phone as lab_phone,
              lab.city as lab_city,
              CONCAT_WS(', ', NULLIF(lab.address_line_1, ''), NULLIF(lab.address_line_2, ''), NULLIF(lab.city, '')) as lab_address
       FROM prescription_lab_tests pl
       LEFT JOIN labs lab ON pl.lab_id = lab.id
       WHERE pl.prescription_id = $1`,
      [p.id],
    );
    const dob = p.date_of_birth ? new Date(p.date_of_birth) : null;
    let ageText = '';
    if (dob) {
      const ageDifMs = Date.now() - dob.getTime();
      const ageDate = new Date(ageDifMs);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      ageText = `${age} Years`;
    }
    const ageGender = [ageText, p.gender].filter(Boolean).join(' / ') || 'N/A';

    const patIdShort = (p.patient_id || '').substring(0, 8).toUpperCase();
    const apptIdShort = (p.appointment_uuid || '').substring(0, 8).toUpperCase();
    const presIdShort = (p.id || '').substring(0, 8).toUpperCase();

    html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            :root {
              --primary: #115E59;
              --primary-light: #F0FDF4;
              --text-main: #1F2937;
              --text-muted: #4B5563;
              --border-color: #E5E7EB;
            }
            html, body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Inter', sans-serif;
              color: var(--text-main);
              background: #fff;
              display: flex;
              flex-direction: column;
              padding: 40px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid var(--primary);
              padding-bottom: 20px;
              margin-bottom: 24px;
            }
            .hospital-info h1 {
              margin: 0 0 8px 0;
              color: var(--primary);
              font-size: 28px;
              font-weight: 700;
            }
            .hospital-info p { margin: 4px 0; color: var(--text-muted); font-size: 14px; }
            .meta-info { text-align: right; font-size: 13px; color: var(--text-muted); }
            
            .patient-card {
              background: var(--primary-light);
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
            }
            .patient-card div { display: flex; flex-direction: column; }
            .label { font-size: 12px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .value { font-size: 15px; font-weight: 600; color: var(--text-main); }
            
            .section { margin-bottom: 24px; }
            .section-title {
              font-size: 16px;
              font-weight: 600;
              color: var(--primary);
              border-bottom: 1px solid var(--border-color);
              padding-bottom: 8px;
              margin-bottom: 16px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            
            .medicines-table { width: 100%; border-collapse: collapse; }
            .medicines-table th {
              background: #f8fafc;
              padding: 12px;
              text-align: left;
              font-size: 13px;
              font-weight: 600;
              color: var(--text-muted);
              border-bottom: 2px solid var(--border-color);
            }
            .medicines-table td {
              padding: 12px;
              border-bottom: 1px solid var(--border-color);
              font-size: 14px;
            }
            .med-name { font-weight: 600; color: var(--text-main); display: block; }
            .med-strength { font-size: 12px; color: var(--text-muted); }
            
            .instructions-box {
              background: #f8fafc;
              border-left: 4px solid var(--primary);
              padding: 16px;
              border-radius: 0 8px 8px 0;
            }
            
            .footer {
              margin-top: auto;
              padding-top: 40px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .signature-box { text-align: center; }
            .signature-line {
              width: 200px;
              border-bottom: 1px solid var(--text-main);
              margin-bottom: 8px;
            }
            .doc-name { font-weight: 600; font-size: 16px; margin: 0; }
            .doc-qual { font-size: 13px; color: var(--text-muted); margin: 4px 0 0 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="hospital-info">
              <h1>${p.hospital_name || 'Dr. Narendran Clinic'}</h1>
              <p>${p.hospital_address || '123 Medical Center Blvd, City'}</p>
              <p>Phone: ${p.hospital_phone || '+1 234-567-8900'}</p>
            </div>
            <div class="meta-info">
              <div>Date: ${new Date(p.created_at).toLocaleDateString()}</div>
              <div style="margin-top: 8px;">ID: ${presIdShort}</div>
            </div>
          </div>
          
          <div class="patient-card">
            <div>
              <span class="label">Patient Name</span>
              <span class="value">${p.patient_name || 'Unknown'}</span>
            </div>
            <div>
              <span class="label">Age / Gender</span>
              <span class="value">${ageGender}</span>
            </div>
            <div>
              <span class="label">Patient ID</span>
              <span class="value">PID-${patIdShort}</span>
            </div>
            <div>
              <span class="label">Appointment ID</span>
              <span class="value">APT-${apptIdShort}</span>
            </div>
          </div>
          
          ${p.diagnosis ? `
          <div class="section">
            <div class="section-title">🩺 Diagnosis</div>
            <div style="font-size: 15px; line-height: 1.5;">${p.diagnosis}</div>
          </div>
          ` : ''}
          
          <div class="section">
            <div class="section-title">💊 Medicines</div>
            <table class="medicines-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Instructions</th>
                </tr>
              </thead>
              <tbody>
                ${medsRes.rows.map((m: any) => `
                  <tr>
                    <td>
                      <span class="med-name">${m.name}</span>
                      ${m.strength ? `<span class="med-strength">${m.strength}</span>` : ''}
                    </td>
                    <td>${m.dosage}</td>
                    <td>${m.frequency}</td>
                    <td>${m.duration}</td>
                    <td>${m.instructions || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          ${labsRes.rows.length > 0 ? `
          <div class="section">
            <div class="section-title">🔬 Lab Tests</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
              ${labsRes.rows.map((l: any) => `
                <li style="margin-bottom: 8px;">
                  <strong>${l.test_name}</strong>
                  ${l.lab_name ? ` <span style="color: #0f766e; font-size: 13px;">(Recommended Lab: ${l.lab_name}${l.lab_city ? ` - ${l.lab_city}` : ''})</span>` : ''}
                  ${l.instructions ? ` - ${l.instructions}` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
          ` : ''}
          
          ${p.general_instructions ? `
          <div class="section">
            <div class="section-title">📝 General Instructions</div>
            <div class="instructions-box">${p.general_instructions}</div>
          </div>
          ` : ''}
          
          <div class="footer">
            <div style="font-size: 12px; color: #6b7280; max-width: 250px;">
              This is a digitally generated prescription and does not require a physical signature if sent electronically.
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <p class="doc-name">Dr. ${p.doc_name || 'Doctor'}</p>
              <p class="doc-qual">${[p.qualification, p.specialization].filter(Boolean).join(', ')}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
export async function downloadPatientHistoryPdf(req: Request, res: Response): Promise<void> {
  const { patientId } = req.params;
  const doctorId = await repo.getDoctorIdByUserId(req.user!.id);

  if (!doctorId) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }

  const { pool } = await import('@/db/pool.js');

  // Fetch doctor and patient info
  const { rows: docRows } = await pool.query(
    `SELECT * FROM doctors WHERE id = $1`, [doctorId]
  );

  const { rows: patRows } = await pool.query(
    `SELECT p.*, u.username as user_username FROM patients p LEFT JOIN user_accounts u ON p.user_account_id = u.id WHERE p.user_account_id = $1`, [patientId]
  );

  const doc = docRows[0];
  const pat = patRows[0];

  if (!pat) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  // Fetch timeline data (copied from getPatientTimeline)
  const { rows: appts } = await pool.query(
    `SELECT 
       a.id, a.scheduled_start AS "scheduledStart", a.scheduled_end AS "scheduledEnd",
       a.status, a.purpose, a.consultation_notes AS "consultationNotes", a.created_at AS "createdAt"
     FROM appointments a
     WHERE a.doctor_id = $1 AND a.patient_id = $2
     ORDER BY a.scheduled_start DESC`,
    [doctorId, patientId]
  );

  const { rows: rxRows } = await pool.query(
    `SELECT 
       p.id, p.appointment_id AS "appointmentId", p.additional_notes AS "notes", p.created_at AS "createdAt",
       json_agg(json_build_object('name', pm.medicine_name, 'dosage', pm.dosage, 'frequency', pm.frequency)) FILTER (WHERE pm.id IS NOT NULL) AS "medicines"
     FROM prescriptions p
     LEFT JOIN prescription_medicines pm ON pm.prescription_id = p.id
     WHERE p.appointment_id IN (SELECT id FROM appointments WHERE patient_id = $1)
     GROUP BY p.id ORDER BY p.created_at DESC`,
    [patientId]
  );

  const { rows: labRows } = await pool.query(
    `SELECT 
       plt.id AS "prescribedTestId", plt.prescription_id AS "prescriptionId", plt.test_name AS "testName",
       plt.lab_id AS "labId", lab.name AS "labName", lab.city AS "labCity",
       CASE WHEN ltr.id IS NOT NULL THEN 'completed' ELSE 'prescribed' END AS "status",
       p.appointment_id AS "appointmentId", ltr.id AS "reportId", ltr.document_url AS "reportUrl",
       ltr.file_name AS "fileName", ltr.file_type AS "fileType", COALESCE(ltr.report_date::timestamp, plt.created_at) AS "date"
     FROM prescription_lab_tests plt
     LEFT JOIN prescriptions p ON p.id = plt.prescription_id
     LEFT JOIN labs lab ON plt.lab_id = lab.id
     LEFT JOIN lab_test_reports ltr ON ltr.prescription_lab_test_id = plt.id
     WHERE plt.patient_id = $1 OR p.patient_id = $1`,
    [patientId]
  );

  const { rows: externalLabRows } = await pool.query(
    `SELECT 
       id AS "reportId", test_name AS "testName", document_url AS "reportUrl", file_name AS "fileName", file_type AS "fileType", report_date AS "date", 'completed' AS "status"
     FROM lab_test_reports
     WHERE patient_id = $1 AND (prescription_lab_test_id IS NULL OR is_external = true)`,
    [patientId]
  );

  const timeline = appts.map(appt => {
    const rx = rxRows.filter(r => r.appointmentId === appt.id);
    const labs = labRows.filter(l => l.appointmentId === appt.id).map(l => ({
      testName: l.testName, status: l.status, date: l.date, labName: l.labName, labCity: l.labCity
    }));
    return { ...appt, prescriptions: rx, labRecords: labs };
  });

  const externalNodes = externalLabRows.map(ext => ({
    id: ext.reportId, scheduledStart: ext.date, status: 'completed', purpose: 'External Lab Report',
    labRecords: [{ testName: ext.testName, status: 'completed', date: ext.date }]
  }));

  const fullTimeline = [...timeline, ...externalNodes].sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime());

  // Generate HTML
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Patient History - ${pat.name || pat.user_username}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 40px; background: #fff; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0E8F6F; padding-bottom: 20px; margin-bottom: 30px; }
        .doc-info h2 { margin: 0; color: #0E8F6F; font-size: 24px; }
        .doc-info p { margin: 4px 0; color: #555; }
        .pat-info { text-align: right; }
        .pat-info h3 { margin: 0; color: #111; font-size: 20px; }
        .pat-info p { margin: 4px 0; color: #555; }
        .timeline-item { border-left: 3px solid #0E8F6F; padding-left: 20px; margin-bottom: 30px; position: relative; }
        .timeline-item::before { content: ''; position: absolute; left: -9px; top: 0; width: 15px; height: 15px; border-radius: 50%; background: #0E8F6F; }
        .date { font-weight: bold; font-size: 16px; color: #111; margin-bottom: 5px; }
        .purpose { font-size: 14px; color: #666; margin-bottom: 10px; }
        .section { background: #f9fafb; padding: 10px 15px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #eee; }
        .section h4 { margin: 0 0 5px 0; color: #0E8F6F; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
        .notes { white-space: pre-wrap; font-size: 14px; }
        ul { margin: 0; padding-left: 20px; font-size: 14px; }
        li { margin-bottom: 3px; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="doc-info">
          <h2>Dr. ${doc.name}</h2>
          <p>${doc.specialization || ''} | ${doc.qualification || ''}</p>
          <p>Reg No: ${doc.medical_registration_number || 'N/A'}</p>
        </div>
        <div class="pat-info">
          <h3>${pat.name || pat.user_username}</h3>
          <p>DOB: ${pat.date_of_birth ? new Date(pat.date_of_birth).toLocaleDateString() : 'N/A'} | Blood: ${pat.blood_group || 'N/A'}</p>
          <p>Gender: ${pat.gender || 'N/A'} | Phone: ${pat.phone || 'N/A'}</p>
        </div>
      </div>
      
      <h2 style="margin-bottom: 30px; text-align: center;">Complete Medical History</h2>
  `;

  if (fullTimeline.length === 0) {
    html += `<p style="text-align: center; color: #666;">No medical history available.</p>`;
  }

  for (const item of fullTimeline) {
    html += `
      <div class="timeline-item">
        <div class="date">${new Date(item.scheduledStart).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div class="purpose">${item.purpose || 'General Consultation'} ${item.status === 'completed' ? '&#10003;' : ''}</div>
    `;

    if (item.consultationNotes) {
      html += `
        <div class="section">
          <h4>Consultation Notes</h4>
          <div class="notes">${item.consultationNotes}</div>
        </div>
      `;
    }

    if (item.prescriptions && item.prescriptions.length > 0) {
      html += `
        <div class="section">
          <h4>Prescribed Medicines</h4>
          <ul>
            ${item.prescriptions.map((p: any) => p.medicines?.map((m: any) => `<li><strong>${m.name}</strong> - ${m.dosage} (${m.frequency})</li>`).join('') || '').join('')}
          </ul>
        </div>
      `;
    }

    if (item.labRecords && item.labRecords.length > 0) {
      html += `
        <div class="section">
          <h4>Lab Reports</h4>
          <ul>
            ${item.labRecords.map((l: any) => `<li>${l.testName} <span style="color:#666; font-size:12px;">(${l.status})</span></li>`).join('')}
          </ul>
        </div>
      `;
    }

    html += `</div>`;
  }

  html += `
      <div class="footer">
        Generated on ${new Date().toLocaleString()} by Dr. Narendran App
      </div>
    </body>
    </html>
  `;

  try {

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    const safePatName = (pat.name || pat.user_username || 'patient').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.setHeader('Content-Disposition', `attachment; filename="${safePatName}_history.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error('Failed to generate history PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
