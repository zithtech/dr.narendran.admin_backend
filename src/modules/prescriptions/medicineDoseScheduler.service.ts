import { pool } from '@/db/pool.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

export const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours
export const UNMARKED_NUDGE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes after scheduled time
export const UPCOMING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes before scheduled time

export class MedicineDoseSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Parse "YYYY-MM-DD" and "hh:mm AM/PM" into a local JavaScript Date.
   */
  public parseScheduledDateTime(dateStr: string, timeStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0] ?? 2026;
    const month = parts[1] ?? 1;
    const day = parts[2] ?? 1;
    let hours = 8;
    let minutes = 0;

    const match = /(\d+):(\d+)\s*(AM|PM)?/i.exec(timeStr);
    if (match?.[1] && match[2]) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const meridiem = (match[3] || '').toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
    }

    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  /**
   * Start the recurring automated dose reminders and adherence scheduler.
   * Runs once on startup (after 10s delay), then every 5 minutes.
   */
  public start(intervalMs: number = 5 * 60 * 1000): void {
    if (this.timer) {
      return;
    }

    logger.info('[MedicineDoseScheduler] Starting automated medicine dose reminder scheduler');

    setTimeout(() => {
      void this.runSchedulerCycle();
    }, 10_000);

    this.timer = setInterval(() => {
      void this.runSchedulerCycle();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[MedicineDoseScheduler] Stopped automated medicine dose reminder scheduler');
    }
  }

  /**
   * Run one complete scheduler check cycle.
   */
  public async runSchedulerCycle(): Promise<{
    scheduledRemindersSent: number;
    unmarkedRemindersSent: number;
    missedDosesProcessed: number;
    doctorAlertsSent: number;
    lowSupplyAlertsSent: number;
    dailySchedulesSent: number;
  }> {
    if (this.isRunning) {
      logger.debug('[MedicineDoseScheduler] Previous scheduler cycle still running, skipping');
      return {
        scheduledRemindersSent: 0,
        unmarkedRemindersSent: 0,
        missedDosesProcessed: 0,
        doctorAlertsSent: 0,
        lowSupplyAlertsSent: 0,
        dailySchedulesSent: 0,
      };
    }

    this.isRunning = true;
    try {
      const scheduledRemindersSent = await this.checkScheduledDoseReminders();
      const unmarkedRemindersSent = await this.checkUnmarkedDoseReminders();
      const missedDosesProcessed = await this.processOverdueAndMissedDoses();
      const doctorAlertsSent = await this.checkDoctorConsecutiveMissedAlerts();
      const lowSupplyAlertsSent = await this.checkLowSupplyReminders();
      const dailySchedulesSent = await this.checkDailyMorningSchedule();

      const totalDispatched =
        scheduledRemindersSent +
        unmarkedRemindersSent +
        missedDosesProcessed +
        doctorAlertsSent +
        lowSupplyAlertsSent +
        dailySchedulesSent;

      if (totalDispatched > 0) {
        logger.info(
          {
            scheduledRemindersSent,
            unmarkedRemindersSent,
            missedDosesProcessed,
            doctorAlertsSent,
            lowSupplyAlertsSent,
            dailySchedulesSent,
          },
          '[MedicineDoseScheduler] Scheduler cycle dispatched notifications',
        );
      }

      return {
        scheduledRemindersSent,
        unmarkedRemindersSent,
        missedDosesProcessed,
        doctorAlertsSent,
        lowSupplyAlertsSent,
        dailySchedulesSent,
      };
    } catch (err) {
      logger.error({ err }, '[MedicineDoseScheduler] Error during scheduler cycle');
      return {
        scheduledRemindersSent: 0,
        unmarkedRemindersSent: 0,
        missedDosesProcessed: 0,
        doctorAlertsSent: 0,
        lowSupplyAlertsSent: 0,
        dailySchedulesSent: 0,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 1. Scheduled medicine dose reminder.
   * Dispatches reminder when scheduled time is due (within 15m before or up to 30m after).
   */
  public async checkScheduledDoseReminders(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      const todayStr = new Date().toISOString().split('T')[0] ?? '';
      const now = new Date();

      const res = await client.query(
        `SELECT ms.*, p.name AS patient_name
           FROM medicine_schedules ms
           LEFT JOIN patients p ON ms.patient_id = p.id OR ms.patient_id = p.user_account_id
          WHERE ms.status = 'PENDING'
            AND ms.scheduled_date = $1
            AND ms.reminder_sent_at IS NULL
          LIMIT 100`,
        [todayStr],
      );

      for (const dose of res.rows) {
        const dStr = typeof dose.scheduled_date === 'string'
          ? (dose.scheduled_date.split('T')[0] ?? '')
          : (dose.scheduled_date ? dose.scheduled_date.toISOString().split('T')[0] : '');
        if (!dStr) continue;

        const scheduledTime = this.parseScheduledDateTime(dStr, dose.scheduled_time);
        const timeUntilDose = scheduledTime.getTime() - now.getTime();
        const timeSinceDose = now.getTime() - scheduledTime.getTime();

        // Due if within 15 minutes before scheduled time, OR within 30 minutes after scheduled time
        if (timeUntilDose <= UPCOMING_WINDOW_MS && timeSinceDose <= UNMARKED_NUDGE_WINDOW_MS) {
          try {
            const patientName = dose.patient_name || 'Patient';
            const doseInfo = dose.dosage || dose.dose_quantity || '1 dose';
            const foodAdvice = dose.food_instruction ? ` · ${dose.food_instruction}` : '';

            await notificationService.sendToPatient(dose.patient_id, {
              type: NotificationType.MEDICINE_DOSE_REMINDER,
              title: `💊 Time for your medicine: ${dose.medicine_name}`,
              body: `Hi ${patientName}, your ${dose.scheduled_time} dose of ${dose.medicine_name} (${doseInfo}${foodAdvice}) is due. Tap to log your dose.`,
              entityType: 'MEDICINE_SCHEDULE',
              entityId: dose.id,
              route: 'MedicineTracking',
              data: {
                scheduleId: dose.id,
                prescriptionId: dose.prescription_id,
                medicineName: dose.medicine_name,
                scheduledTime: dose.scheduled_time,
                initialTab: 'today',
              },
            });

            await client.query(
              `UPDATE medicine_schedules SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [dose.id],
            );
            sentCount++;
          } catch (err) {
            logger.warn({ err, doseId: dose.id }, '[MedicineDoseScheduler] Failed sending dose reminder');
          }
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }

  /**
   * 2. Reminder for dose not marked as taken.
   * Dispatches gentle nudge 30–60 minutes after scheduled time if still pending.
   */
  public async checkUnmarkedDoseReminders(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      const todayStr = new Date().toISOString().split('T')[0] ?? '';
      const now = new Date();

      const res = await client.query(
        `SELECT ms.*, p.name AS patient_name
           FROM medicine_schedules ms
           LEFT JOIN patients p ON ms.patient_id = p.id OR ms.patient_id = p.user_account_id
          WHERE ms.status = 'PENDING'
            AND ms.scheduled_date = $1
            AND ms.reminder_sent_at IS NOT NULL
            AND ms.unmarked_reminder_sent_at IS NULL
          LIMIT 100`,
        [todayStr],
      );

      for (const dose of res.rows) {
        const dStr = typeof dose.scheduled_date === 'string'
          ? (dose.scheduled_date.split('T')[0] ?? '')
          : (dose.scheduled_date ? dose.scheduled_date.toISOString().split('T')[0] : '');
        if (!dStr) continue;

        const scheduledTime = this.parseScheduledDateTime(dStr, dose.scheduled_time);
        const timeSinceDose = now.getTime() - scheduledTime.getTime();

        // If at least 30 minutes have passed, but within the 2-hour grace period
        if (timeSinceDose >= UNMARKED_NUDGE_WINDOW_MS && timeSinceDose < GRACE_PERIOD_MS) {
          try {
            const patientName = dose.patient_name || 'Patient';

            await notificationService.sendToPatient(dose.patient_id, {
              type: NotificationType.DOSE_NOT_TAKEN_REMINDER,
              title: `⏰ Dose Pending: Have you taken ${dose.medicine_name}?`,
              body: `Hi ${patientName}, your ${dose.scheduled_time} dose of ${dose.medicine_name} is still pending. Tap to mark as taken or skipped.`,
              entityType: 'MEDICINE_SCHEDULE',
              entityId: dose.id,
              route: 'MedicineTracking',
              data: {
                scheduleId: dose.id,
                prescriptionId: dose.prescription_id,
                medicineName: dose.medicine_name,
                scheduledTime: dose.scheduled_time,
                initialTab: 'today',
              },
            });

            await client.query(
              `UPDATE medicine_schedules SET unmarked_reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [dose.id],
            );
            sentCount++;
          } catch (err) {
            logger.warn({ err, doseId: dose.id }, '[MedicineDoseScheduler] Failed sending unmarked dose reminder');
          }
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }

  /**
   * 3. Missed-dose notification.
   * Auto-transitions doses exceeding the 2-hour grace period to MISSED and alerts patient.
   */
  public async processOverdueAndMissedDoses(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      const now = new Date();

      const res = await client.query(
        `SELECT ms.*, p.name AS patient_name, d.name AS doctor_name
           FROM medicine_schedules ms
           LEFT JOIN patients p ON ms.patient_id = p.id OR ms.patient_id = p.user_account_id
           LEFT JOIN prescriptions pr ON ms.prescription_id = pr.id
           LEFT JOIN doctors d ON pr.doctor_id = d.id
          WHERE (ms.status = 'PENDING' OR (ms.status = 'MISSED' AND ms.missed_notification_sent_at IS NULL))
          LIMIT 100`,
      );

      for (const dose of res.rows) {
        const dStr = typeof dose.scheduled_date === 'string'
          ? (dose.scheduled_date.split('T')[0] ?? '')
          : (dose.scheduled_date ? dose.scheduled_date.toISOString().split('T')[0] : '');
        if (!dStr) continue;

        const scheduledTime = this.parseScheduledDateTime(dStr, dose.scheduled_time);
        const timeSinceDose = now.getTime() - scheduledTime.getTime();

        // Exceeded grace period
        if (timeSinceDose >= GRACE_PERIOD_MS) {
          try {
            // Update status to MISSED if still PENDING
            await client.query(
              `UPDATE medicine_schedules 
                  SET status = 'MISSED', 
                      missed_at = COALESCE(missed_at, NOW()),
                      missed_notification_sent_at = NOW(),
                      updated_at = NOW()
                WHERE id = $1`,
              [dose.id],
            );

            // Send missed dose warning notification to patient
            const patientName = dose.patient_name || 'Patient';
            const doctorName = dose.doctor_name || 'Dr. Narendran';

            await notificationService.sendToPatient(dose.patient_id, {
              type: NotificationType.MISSED_DOSE_NOTIFICATION,
              title: `⚠️ Missed Dose: ${dose.medicine_name}`,
              body: `Hi ${patientName}, your ${dose.scheduled_time} dose of ${dose.medicine_name} was missed. Do not double your next dose without consulting Dr. ${doctorName}.`,
              entityType: 'MEDICINE_SCHEDULE',
              entityId: dose.id,
              route: 'MedicineTracking',
              data: {
                scheduleId: dose.id,
                prescriptionId: dose.prescription_id,
                medicineName: dose.medicine_name,
                scheduledTime: dose.scheduled_time,
                initialTab: 'today',
              },
            });

            sentCount++;
          } catch (err) {
            logger.warn({ err, doseId: dose.id }, '[MedicineDoseScheduler] Failed sending missed dose notification');
          }
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }

  /**
   * 4. Alert to doctor when patient misses >= 3 consecutive doses (non-adherence alert).
   */
  public async checkDoctorConsecutiveMissedAlerts(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      // Find active prescriptions with missed doses in past 72 hours
      const activeRxRes = await client.query(
        `SELECT DISTINCT pr.id AS prescription_id, pr.patient_id, pr.doctor_id,
                p.name AS patient_name, d.name AS doctor_name
           FROM prescriptions pr
           JOIN medicine_schedules ms ON ms.prescription_id = pr.id
           LEFT JOIN patients p ON pr.patient_id = p.id OR pr.patient_id = p.user_account_id
           LEFT JOIN doctors d ON pr.doctor_id = d.id
          WHERE LOWER(pr.status) = 'active'
            AND ms.status = 'MISSED'
            AND ms.updated_at >= NOW() - INTERVAL '72 hours'`,
      );

      for (const rx of activeRxRes.rows) {
        if (!rx.doctor_id) continue;

        // Fetch recent chronological doses up to now
        const dosesRes = await client.query(
          `SELECT id, medicine_name, status, scheduled_date, scheduled_time
             FROM medicine_schedules
            WHERE prescription_id = $1
              AND (scheduled_date < CURRENT_DATE 
                   OR (scheduled_date = CURRENT_DATE AND (status = 'TAKEN' OR status = 'MISSED' OR status = 'SKIPPED')))
            ORDER BY scheduled_date DESC, scheduled_time DESC, created_at DESC
            LIMIT 10`,
          [rx.prescription_id],
        );

        if (dosesRes.rows.length < 3) continue;

        // Check if the top 3 or more consecutive most recent doses are MISSED
        let consecutiveMissed = 0;
        let missedMedNames: string[] = [];

        for (const d of dosesRes.rows) {
          if (d.status === 'MISSED') {
            consecutiveMissed++;
            if (!missedMedNames.includes(d.medicine_name)) {
              missedMedNames.push(d.medicine_name);
            }
          } else {
            break; // Sequence broken
          }
        }

        if (consecutiveMissed >= 3) {
          // Check if an active unacknowledged alert already exists
          const existingAlert = await client.query(
            `SELECT id FROM patient_adherence_alerts
              WHERE patient_id = $1 
                AND prescription_id = $2
                AND status = 'ACTIVE'
              LIMIT 1`,
            [rx.patient_id, rx.prescription_id],
          );

          if (existingAlert.rows.length === 0) {
            try {
              const patientName = rx.patient_name || 'Patient';
              const medsText = missedMedNames.slice(0, 2).join(', ');

              // Calculate current prescription adherence %
              const statsRes = await client.query(
                `SELECT 
                    COUNT(*) FILTER (WHERE status = 'TAKEN') AS taken,
                    COUNT(*) FILTER (WHERE status = 'TAKEN' OR status = 'MISSED') AS eligible
                   FROM medicine_schedules
                  WHERE prescription_id = $1`,
                [rx.prescription_id],
              );
              const taken = parseInt(statsRes.rows[0]?.taken || '0', 10);
              const eligible = parseInt(statsRes.rows[0]?.eligible || '1', 10);
              const adherencePercent = eligible > 0 ? Math.round((taken / eligible) * 100) : 0;

              // Dispatch High-Priority Alert to Prescribing Doctor
              await notificationService.sendToDoctor(rx.doctor_id, {
                type: NotificationType.PATIENT_NON_ADHERENCE_ALERT,
                title: `🚨 Patient Non-Adherence Alert: ${patientName}`,
                body: `${patientName} has missed ${consecutiveMissed} consecutive doses (${medsText}). Regimen adherence is at ${adherencePercent}%. Tap to review patient details.`,
                entityType: 'PATIENT_ADHERENCE',
                entityId: rx.patient_id,
                route: 'PatientDetail',
                data: {
                  patientId: rx.patient_id,
                  prescriptionId: rx.prescription_id,
                  consecutiveMissed: String(consecutiveMissed),
                  adherencePercent: String(adherencePercent),
                },
              });

              // Record in patient_adherence_alerts table
              await client.query(
                `INSERT INTO patient_adherence_alerts
                    (patient_id, doctor_id, prescription_id, consecutive_missed_count, status, alerted_at)
                  VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())`,
                [rx.patient_id, rx.doctor_id, rx.prescription_id, consecutiveMissed],
              );

              // Update prescription tracking
              await client.query(
                `UPDATE prescriptions 
                    SET non_adherence_alert_sent_at = NOW(),
                        non_adherence_resolved_at = NULL
                  WHERE id = $1`,
                [rx.prescription_id],
              );

              sentCount++;
              logger.info(
                { patientId: rx.patient_id, doctorId: rx.doctor_id, consecutiveMissed },
                '[MedicineDoseScheduler] Sent non-adherence alert to doctor',
              );
            } catch (err) {
              logger.warn({ err, rxId: rx.prescription_id }, '[MedicineDoseScheduler] Failed sending doctor non-adherence alert');
            }
          }
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }

  /**
   * 5. Medicine supply running low.
   * Warns patient when remaining doses <= 3 days worth.
   */
  public async checkLowSupplyReminders(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      const lowSupplyRes = await client.query(
        `SELECT pm.id AS prescription_medicine_id,
                pm.medicine_name,
                pm.prescribed_quantity,
                pm.frequency,
                pm.duration,
                pr.id AS prescription_id,
                pr.patient_id,
                p.name AS patient_name,
                (SELECT COUNT(*) FROM medicine_schedules ms WHERE ms.prescription_medicine_id = pm.id AND ms.status = 'TAKEN') AS taken_count,
                (SELECT COUNT(*) FROM medicine_schedules ms WHERE ms.prescription_medicine_id = pm.id) AS total_scheduled_count
           FROM prescription_medicines pm
           JOIN prescriptions pr ON pm.prescription_id = pr.id
           LEFT JOIN patients p ON pr.patient_id = p.id OR pr.patient_id = p.user_account_id
          WHERE LOWER(pr.status) = 'active'
            AND pm.supply_low_reminder_sent_at IS NULL
          LIMIT 50`,
      );

      for (const item of lowSupplyRes.rows) {
        const totalScheduled = parseInt(item.total_scheduled_count || '0', 10);
        const taken = parseInt(item.taken_count || '0', 10);

        if (totalScheduled === 0 || taken === 0) continue;

        // Determine daily dose rate based on frequency
        const freq = (item.frequency || '').toLowerCase();
        let dailyDoses = 1;
        if (freq.includes('twice') || freq.includes('2') || freq.includes('bd') || freq.includes('bid')) dailyDoses = 2;
        else if (freq.includes('three') || freq.includes('3') || freq.includes('tds') || freq.includes('tid')) dailyDoses = 3;
        else if (freq.includes('four') || freq.includes('4') || freq.includes('qid')) dailyDoses = 4;

        const remainingDoses = Math.max(0, totalScheduled - taken);
        const daysLeft = Math.ceil(remainingDoses / dailyDoses);

        // Low supply if 3 days or fewer remaining
        if (daysLeft <= 3) {
          try {
            const patientName = item.patient_name || 'Patient';

            await notificationService.sendToPatient(item.patient_id, {
              type: NotificationType.MEDICINE_SUPPLY_LOW,
              title: `📦 Medicine Supply Running Low: ${item.medicine_name}`,
              body: `Hi ${patientName}, you have approximately ${daysLeft} days of ${item.medicine_name} left. Tap to reorder directly from our pharmacy.`,
              entityType: 'PRESCRIPTION',
              entityId: item.prescription_id,
              route: 'OrderFromPharmacy',
              data: {
                prescriptionId: item.prescription_id,
                medicineName: item.medicine_name,
                daysLeft: String(daysLeft),
              },
            });

            await client.query(
              `UPDATE prescription_medicines SET supply_low_reminder_sent_at = NOW() WHERE id = $1`,
              [item.prescription_medicine_id],
            );

            sentCount++;
          } catch (err) {
            logger.warn({ err, medId: item.prescription_medicine_id }, '[MedicineDoseScheduler] Failed sending low supply alert');
          }
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }

  /**
   * 6. Daily medicine schedule reminder.
   * Dispatches morning schedule briefing to patients with scheduled doses today.
   */
  public async checkDailyMorningSchedule(): Promise<number> {
    const client = await pool.connect();
    let sentCount = 0;

    try {
      const todayStr = new Date().toISOString().split('T')[0] ?? '';

      // Find patients with scheduled doses today who haven't received a daily reminder yet today
      const res = await client.query(
        `SELECT ms.patient_id, 
                p.name AS patient_name,
                COUNT(ms.id) AS total_doses,
                STRING_AGG(DISTINCT ms.medicine_name, ', ') AS medicine_names
           FROM medicine_schedules ms
           LEFT JOIN patients p ON ms.patient_id = p.id OR ms.patient_id = p.user_account_id
           LEFT JOIN patient_daily_schedule_reminders pd 
                  ON pd.patient_id = ms.patient_id AND pd.scheduled_date = $1::date
          WHERE ms.scheduled_date = $1::date
            AND pd.id IS NULL
          GROUP BY ms.patient_id, p.name
          HAVING COUNT(ms.id) > 0
          LIMIT 100`,
        [todayStr],
      );

      for (const row of res.rows) {
        try {
          const patientName = row.patient_name || 'Patient';
          const totalDoses = parseInt(row.total_doses || '0', 10);
          const medSummary = row.medicine_names || 'prescribed medicines';

          await notificationService.sendToPatient(row.patient_id, {
            type: NotificationType.DAILY_MEDICINE_SCHEDULE,
            title: `🌅 Today's Medication Schedule (${totalDoses} dose${totalDoses === 1 ? '' : 's'})`,
            body: `Good morning ${patientName}! You have ${totalDoses} doses scheduled today (${medSummary}). Tap to view your medication timeline.`,
            entityType: 'MEDICINE_SCHEDULE',
            entityId: todayStr,
            route: 'MedicineTracking',
            data: {
              scheduledDate: todayStr,
              totalDoses: String(totalDoses),
              initialTab: 'today',
            },
          });

          await client.query(
            `INSERT INTO patient_daily_schedule_reminders
                (patient_id, scheduled_date, total_doses, sent_at)
              VALUES ($1, $2::date, $3, NOW())
              ON CONFLICT (patient_id, scheduled_date) DO NOTHING`,
            [row.patient_id, todayStr, totalDoses],
          );

          sentCount++;
        } catch (err) {
          logger.warn({ err, patientId: row.patient_id }, '[MedicineDoseScheduler] Failed sending daily schedule briefing');
        }
      }
    } finally {
      client.release();
    }

    return sentCount;
  }
}

export const medicineDoseSchedulerService = new MedicineDoseSchedulerService();
