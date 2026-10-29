import { pool } from '@/db/pool.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

export class FollowUpSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start recurring background checker.
   * Runs once immediately on boot, then every hour.
   */
  public start(intervalMs: number = 60 * 60 * 1000): void {
    if (this.timer) {
      return;
    }

    logger.info('[FollowUpScheduler] Starting automated follow-up reminder scheduler');

    // Run first check after a brief 10-second startup delay
    setTimeout(() => {
      void this.checkAndSendReminders();
    }, 10_000);

    this.timer = setInterval(() => {
      void this.checkAndSendReminders();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[FollowUpScheduler] Stopped automated follow-up reminder scheduler');
    }
  }

  /**
   * Check for upcoming 3-day and same-day follow-up prescriptions and dispatch reminders.
   */
  public async checkAndSendReminders(): Promise<{ threeDaySent: number; sameDaySent: number }> {
    if (this.isRunning) {
      logger.debug('[FollowUpScheduler] Previous reminder check still running, skipping cycle');
      return { threeDaySent: 0, sameDaySent: 0 };
    }

    this.isRunning = true;
    let threeDaySent = 0;
    let sameDaySent = 0;

    try {
      // 1. Check for 3-day reminders
      const threeDayQuery = `
        SELECT 
          pr.id AS prescription_id,
          pr.patient_id,
          pr.doctor_id,
          pr.follow_up_date,
          p.name AS patient_name,
          d.name AS doctor_name,
          d.branch_id,
          b.name AS branch_name
        FROM prescriptions pr
        LEFT JOIN patients p ON pr.patient_id = p.id OR pr.patient_id = p.user_account_id
        LEFT JOIN doctors d ON pr.doctor_id = d.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        WHERE pr.follow_up_status = 'pending'
          AND pr.follow_up_date = CURRENT_DATE + INTERVAL '3 days'
          AND pr.follow_up_3day_reminder_sent_at IS NULL
        LIMIT 100;
      `;

      const threeDayRes = await pool.query(threeDayQuery);
      for (const rx of threeDayRes.rows) {
        try {
          const dateStr = rx.follow_up_date
            ? new Date(rx.follow_up_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'in 3 days';
          const doctorName = rx.doctor_name || 'Dr. Narendran';
          const patientName = rx.patient_name || 'Patient';

          await notificationService.sendToPatient(rx.patient_id, {
            type: NotificationType.FOLLOW_UP_REMINDER,
            title: '⏰ Upcoming Follow-up Checkup in 3 Days',
            body: `Hi ${patientName}, your follow-up with Dr. ${doctorName} is due on ${dateStr}. Tap to reserve your preferred slot.`,
            entityType: 'FOLLOW_UP',
            entityId: rx.prescription_id,
            route: 'BookAppointment',
            data: {
              prescriptionId: rx.prescription_id,
              doctorId: rx.doctor_id ? String(rx.doctor_id) : '',
              doctorName,
              branchId: rx.branch_id ? String(rx.branch_id) : '',
              branchName: rx.branch_name || 'Clinic',
              targetDate: rx.follow_up_date ? new Date(rx.follow_up_date).toISOString().split('T')[0] : '',
              purpose: 'Follow-up Consultation',
            },
          });

          await pool.query(
            `UPDATE prescriptions SET follow_up_3day_reminder_sent_at = NOW() WHERE id = $1`,
            [rx.prescription_id],
          );
          threeDaySent++;
        } catch (notifErr) {
          logger.warn({ notifErr, rxId: rx.prescription_id }, '[FollowUpScheduler] Failed sending 3-day reminder');
        }
      }

      // 2. Check for same-day morning reminders
      const sameDayQuery = `
        SELECT 
          pr.id AS prescription_id,
          pr.patient_id,
          pr.doctor_id,
          pr.follow_up_date,
          p.name AS patient_name,
          d.name AS doctor_name,
          d.branch_id,
          b.name AS branch_name
        FROM prescriptions pr
        LEFT JOIN patients p ON pr.patient_id = p.id OR pr.patient_id = p.user_account_id
        LEFT JOIN doctors d ON pr.doctor_id = d.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        WHERE pr.follow_up_status = 'pending'
          AND pr.follow_up_date = CURRENT_DATE
          AND pr.follow_up_sameday_reminder_sent_at IS NULL
        LIMIT 100;
      `;

      const sameDayRes = await pool.query(sameDayQuery);
      for (const rx of sameDayRes.rows) {
        try {
          const dateStr = rx.follow_up_date
            ? new Date(rx.follow_up_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'today';
          const doctorName = rx.doctor_name || 'Dr. Narendran';
          const patientName = rx.patient_name || 'Patient';

          await notificationService.sendToPatient(rx.patient_id, {
            type: NotificationType.FOLLOW_UP_REMINDER,
            title: '🗓️ Follow-up Consultation Due Today',
            body: `Hi ${patientName}, your recommended follow-up with Dr. ${doctorName} is today (${dateStr}). Tap to book your visit or consultation.`,
            entityType: 'FOLLOW_UP',
            entityId: rx.prescription_id,
            route: 'BookAppointment',
            data: {
              prescriptionId: rx.prescription_id,
              doctorId: rx.doctor_id ? String(rx.doctor_id) : '',
              doctorName,
              branchId: rx.branch_id ? String(rx.branch_id) : '',
              branchName: rx.branch_name || 'Clinic',
              targetDate: rx.follow_up_date ? new Date(rx.follow_up_date).toISOString().split('T')[0] : '',
              purpose: 'Follow-up Consultation',
            },
          });

          await pool.query(
            `UPDATE prescriptions SET follow_up_sameday_reminder_sent_at = NOW() WHERE id = $1`,
            [rx.prescription_id],
          );
          sameDaySent++;
        } catch (notifErr) {
          logger.warn({ notifErr, rxId: rx.prescription_id }, '[FollowUpScheduler] Failed sending same-day reminder');
        }
      }

      if (threeDaySent > 0 || sameDaySent > 0) {
        logger.info(
          { threeDaySent, sameDaySent },
          '[FollowUpScheduler] Processed automated follow-up reminders',
        );
      }
    } catch (err) {
      logger.error({ err }, '[FollowUpScheduler] Error during follow-up reminder cycle');
    } finally {
      this.isRunning = false;
    }

    return { threeDaySent, sameDaySent };
  }
}

export const followUpSchedulerService = new FollowUpSchedulerService();
