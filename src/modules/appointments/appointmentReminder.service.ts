import { pool } from '@/db/pool.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

import { formatAppointmentDateTime } from './appointments.formatter.js';

export class AppointmentReminderService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Schedules 1-day (24h) and 30-minute reminders for an appointment.
   * Idempotent: uses UNIQUE (idempotency_key) in appointment_reminders table.
   */
  async scheduleRemindersForAppointment(appt: {
    id: string;
    patientId: string;
    scheduledStart: string | Date;
  }): Promise<void> {
    const start = new Date(appt.scheduledStart);
    if (isNaN(start.getTime())) return;

    const oneDayBefore = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const thirtyMinBefore = new Date(start.getTime() - 30 * 60 * 1000);
    const now = new Date();

    try {
      if (oneDayBefore > now) {
        const key1Day = `appt_rem:1_DAY:${appt.id}:${start.toISOString()}`;
        await pool.query(
          `INSERT INTO appointment_reminders 
            (appointment_id, patient_id, reminder_type, scheduled_for, idempotency_key)
           VALUES ($1, $2, '1_DAY', $3, $4)
           ON CONFLICT (idempotency_key) DO NOTHING;`,
          [appt.id, appt.patientId, oneDayBefore.toISOString(), key1Day],
        );
      }

      if (thirtyMinBefore > now) {
        const key30Min = `appt_rem:30_MIN:${appt.id}:${start.toISOString()}`;
        await pool.query(
          `INSERT INTO appointment_reminders 
            (appointment_id, patient_id, reminder_type, scheduled_for, idempotency_key)
           VALUES ($1, $2, '30_MIN', $3, $4)
           ON CONFLICT (idempotency_key) DO NOTHING;`,
          [appt.id, appt.patientId, thirtyMinBefore.toISOString(), key30Min],
        );
      }
    } catch (err) {
      logger.error({ err, appointmentId: appt.id }, '[ReminderService] Failed to schedule reminders');
    }
  }

  /**
   * Cancels all pending reminders for an appointment.
   */
  async cancelRemindersForAppointment(appointmentId: string): Promise<number> {
    try {
      const res = await pool.query(
        `UPDATE appointment_reminders 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE appointment_id = $1 AND status = 'PENDING'
         RETURNING id;`,
        [appointmentId],
      );
      return res.rowCount ?? 0;
    } catch (err) {
      logger.error({ err, appointmentId }, '[ReminderService] Failed to cancel reminders');
      return 0;
    }
  }

  /**
   * Reschedules reminders when an appointment date/time changes.
   * Cancels previous pending reminders and inserts new ones.
   */
  async rescheduleRemindersForAppointment(appt: {
    id: string;
    patientId: string;
    scheduledStart: string | Date;
  }): Promise<void> {
    await this.cancelRemindersForAppointment(appt.id);
    await this.scheduleRemindersForAppointment(appt);
  }

  /**
   * Process all due reminders that are scheduled_for <= NOW().
   * Uses row-level locking (FOR UPDATE OF r SKIP LOCKED) to guarantee concurrency safety.
   */
  async processDueReminders(): Promise<{
    processedCount: number;
    sentCount: number;
    cancelledCount: number;
  }> {
    const client = await pool.connect();
    let processedCount = 0;
    let sentCount = 0;
    let cancelledCount = 0;

    try {
      await client.query('BEGIN');

      const dueRes = await client.query<{
        reminder_id: string;
        appointment_id: string;
        patient_id: string;
        reminder_type: string;
        scheduled_for: string;
        idempotency_key: string;
        scheduled_start: string;
        token_number: string | null;
        appointment_status?: string;
        appt_status?: string;
        doctor_name: string;
      }>(
        `SELECT 
           r.id AS reminder_id,
           r.appointment_id,
           r.patient_id,
           r.reminder_type,
           r.scheduled_for,
           r.idempotency_key,
           a.scheduled_start,
           a.token_number,
           a.status AS appointment_status,
           a.status AS appt_status,
           COALESCE(d.name, 'Dr. Narendran') AS doctor_name
         FROM appointment_reminders r
         JOIN appointments a ON r.appointment_id = a.id
         LEFT JOIN doctors d ON a.doctor_id = d.id
         WHERE r.status = 'PENDING'
           AND r.scheduled_for <= NOW()
           AND r.scheduled_for >= NOW() - INTERVAL '2 hours'
         ORDER BY r.scheduled_for ASC
         LIMIT 50
         FOR UPDATE OF r SKIP LOCKED;`,
      );

      const reminders = dueRes.rows;
      processedCount = reminders.length;

      for (const rem of reminders) {
        // Check if appointment is still active
        const status = rem.appt_status || rem.appointment_status || '';
        const isActive = ['scheduled', 'confirmed', 'rescheduled'].includes(status);

        if (!isActive) {
          // Cancel obsolete reminder for cancelled/completed/no-show appointment
          await client.query(
            `UPDATE appointment_reminders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1;`,
            [rem.reminder_id],
          );
          cancelledCount++;
          continue;
        }

        // Format appointment date and time in Asia/Kolkata
        const { timeStr } = formatAppointmentDateTime(rem.scheduled_start);
        const rawToken = rem.token_number ? String(rem.token_number).trim() : '01';
        const tokenDisplay = rawToken.startsWith('#') ? rawToken : `#${rawToken}`;

        const is1Day = rem.reminder_type === '1_DAY';
        const title = is1Day ? 'Upcoming Appointment Tomorrow' : 'Appointment Starting Soon';
        const body = is1Day
          ? `Reminder: You have an appointment with ${rem.doctor_name} tomorrow at ${timeStr}. Token: ${tokenDisplay}`
          : `Your appointment with ${rem.doctor_name} starts in 30 minutes at ${timeStr}. Token: ${tokenDisplay}`;

        // Dispatch notification
        try {
          await notificationService.sendToPatient(rem.patient_id, {
            type: NotificationType.APPOINTMENT_REMINDER,
            title,
            body,
            entityType: 'APPOINTMENT',
            entityId: rem.appointment_id,
            route: 'AppointmentDetail',
            idempotencyKey: rem.idempotency_key,
            data: {
              type: NotificationType.APPOINTMENT_REMINDER,
              appointmentId: rem.appointment_id,
              screen: 'AppointmentDetail',
              reminderType: rem.reminder_type,
            },
          });

          await client.query(
            `UPDATE appointment_reminders SET status = 'SENT', sent_at = NOW(), updated_at = NOW() WHERE id = $1;`,
            [rem.reminder_id],
          );
          sentCount++;
        } catch (sendErr) {
          logger.error(
            { sendErr, reminderId: rem.reminder_id },
            '[ReminderService] Failed to send reminder notification',
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, '[ReminderService] Error processing due reminders');
    } finally {
      client.release();
    }

    // Also sweep expired reschedule requests and notify patients
    try {
      const { sweepExpiredRescheduleRequests } = await import('./appointments.service.js');
      await sweepExpiredRescheduleRequests();
    } catch (sweepErr) {
      logger.warn({ sweepErr }, '[ReminderService] Error sweeping expired reschedule requests');
    }

    return { processedCount, sentCount, cancelledCount };
  }

  startReminderWorker(intervalMs = 60_000): void {
    this.start(intervalMs);
  }

  stopReminderWorker(): void {
    this.stop();
  }

  start(intervalMs = 60_000): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (this.timer) {
      return;
    }

    logger.info('[ReminderService] Starting appointment reminder background worker');
    // Run once immediately on startup
    void this.processDueReminders().catch((err) => {
      logger.error({ err }, '[ReminderService] Error in initial reminder run');
    });

    this.timer = setInterval(() => {
      if (this.isRunning) return;
      this.isRunning = true;
      this.processDueReminders()
        .catch((err) => {
          logger.error({ err }, '[ReminderService] Error in periodic reminder run');
        })
        .finally(() => {
          this.isRunning = false;
        });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[ReminderService] Appointment reminder background worker stopped');
    }
  }
}

export const appointmentReminderService = new AppointmentReminderService();
