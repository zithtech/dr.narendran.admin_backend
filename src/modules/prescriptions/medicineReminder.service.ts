import { pool } from "@/db/pool.js";
import { logger } from "@/lib/logger.js";
import { notificationService } from "@/modules/notifications/notification.service.js";
import { NotificationType } from "@/modules/notifications/notification.types.js";

export const MISSED_DOSE_GRACE_MINUTES = 120; // 2 hours

export class MedicineReminderService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Parses date string (YYYY-MM-DD) and 12-hour time string (e.g. "08:00 AM" or "02:30 PM")
   * into a UTC Date object representing that moment in Indian Standard Time (Asia/Kolkata, UTC+05:30).
   */
  parseScheduledDateTimeIST(dateStr: string, timeStr: string): Date {
    const dateParts = dateStr.split("-").map(Number);
    const year = dateParts[0] ?? 2026;
    const month = String(dateParts[1] ?? 1).padStart(2, "0");
    const day = String(dateParts[2] ?? 1).padStart(2, "0");

    let hours = 8;
    let minutes = 0;

    const match = /(\d+):(\d+)\s*(AM|PM)?/i.exec(timeStr);
    if (match && match[1] && match[2]) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const meridiem = (match[3] || "").toUpperCase();
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
    }

    const hoursStr = String(hours).padStart(2, "0");
    const minsStr = String(minutes).padStart(2, "0");

    // Parse explicitly with Asia/Kolkata offset (+05:30)
    const isoString = `${year}-${month}-${day}T${hoursStr}:${minsStr}:00+05:30`;
    return new Date(isoString);
  }

  /**
   * Schedules initial reminder records in `medicine_reminders` for a prescription.
   */
  async scheduleRemindersForPrescription(prescriptionId: string): Promise<number> {
    const client = await pool.connect();
    let scheduledCount = 0;

    try {
      // Fetch active prescription details and pending doses
      const rxRes = await client.query(
        `SELECT id, patient_id, status FROM prescriptions WHERE id = $1`,
        [prescriptionId],
      );
      if (rxRes.rows.length === 0) return 0;
      const rx = rxRes.rows[0];

      if (["cancelled", "deleted", "completed"].includes((rx.status || "").toLowerCase())) {
        return 0;
      }

      const schedulesRes = await client.query(
        `SELECT id, patient_id, medicine_name, scheduled_date, scheduled_time, status 
         FROM medicine_schedules 
         WHERE prescription_id = $1 AND status = 'PENDING'`,
        [prescriptionId],
      );

      for (const row of schedulesRes.rows) {
        const dStr = typeof row.scheduled_date === "string"
          ? row.scheduled_date.split("T")[0]
          : (row.scheduled_date as any).toISOString().split("T")[0];

        const scheduledTimeIST = this.parseScheduledDateTimeIST(dStr, row.scheduled_time);
        const cleanTime = (row.scheduled_time || "dose").replace(/\s+/g, "_");
        const idempotencyKey = `med_rem:due:${row.id}:${dStr}:${cleanTime}`;

        const insertRes = await client.query(
          `INSERT INTO medicine_reminders 
             (patient_id, prescription_id, schedule_id, reminder_type, scheduled_for, status, idempotency_key)
           VALUES ($1, $2, $3, 'DOSE_DUE', $4, 'PENDING', $5)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [row.patient_id, prescriptionId, row.id, scheduledTimeIST.toISOString(), idempotencyKey],
        );

        if ((insertRes.rowCount ?? 0) > 0) {
          scheduledCount++;
        }
      }

      logger.info({ prescriptionId, scheduledCount }, "[MedicineReminder] Scheduled dose reminders");
      return scheduledCount;
    } catch (err) {
      logger.error({ err, prescriptionId }, "[MedicineReminder] Failed to schedule reminders for prescription");
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Cancels all pending reminders for a prescription (e.g. when cancelled, discontinued, or completed).
   */
  async cancelRemindersForPrescription(prescriptionId: string): Promise<number> {
    try {
      const res = await pool.query(
        `UPDATE medicine_reminders 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE prescription_id = $1 AND status = 'PENDING'
         RETURNING id`,
        [prescriptionId],
      );
      logger.info({ prescriptionId, count: res.rowCount }, "[MedicineReminder] Cancelled reminders for prescription");
      return res.rowCount ?? 0;
    } catch (err) {
      logger.error({ err, prescriptionId }, "[MedicineReminder] Failed to cancel reminders for prescription");
      return 0;
    }
  }

  /**
   * Process all due reminders that are scheduled_for <= NOW().
   * Uses row-level locking (FOR UPDATE OF mr SKIP LOCKED) for multi-worker safety.
   */
  async processDueReminders(referenceDate = new Date()): Promise<{
    processedCount: number;
    sentCount: number;
    skippedCount: number;
    cancelledCount: number;
  }> {
    const client = await pool.connect();
    let processedCount = 0;
    let sentCount = 0;
    let skippedCount = 0;
    let cancelledCount = 0;

    try {
      await client.query("BEGIN");

      // Select due reminders up to 2 hours in the past
      const dueRes = await client.query<{
        reminder_id: string;
        patient_id: string;
        prescription_id: string;
        schedule_id: string;
        reminder_type: string;
        scheduled_for: Date;
        idempotency_key: string;
        prescription_status: string;
        schedule_status: string | null;
        medicine_name: string | null;
        dosage: string | null;
        food_instruction: string | null;
        scheduled_time: string | null;
      }>(
        `SELECT 
           mr.id AS reminder_id,
           mr.patient_id,
           mr.prescription_id,
           mr.schedule_id,
           mr.reminder_type,
           mr.scheduled_for,
           mr.idempotency_key,
           p.status AS prescription_status,
           ms.status AS schedule_status,
           ms.medicine_name,
           ms.dosage,
           ms.food_instruction,
           ms.scheduled_time
         FROM medicine_reminders mr
         JOIN prescriptions p ON mr.prescription_id = p.id
         LEFT JOIN medicine_schedules ms ON mr.schedule_id = ms.id
         WHERE mr.status = 'PENDING'
           AND mr.scheduled_for <= $1
           AND mr.scheduled_for >= $1::timestamptz - INTERVAL '2 hours'
         ORDER BY mr.scheduled_for ASC
         LIMIT 50
         FOR UPDATE OF mr SKIP LOCKED`,
        [referenceDate.toISOString()],
      );

      processedCount = dueRes.rows.length;

      for (const row of dueRes.rows) {
        // 1. Inactive prescription check
        const pStatus = (row.prescription_status || "").toLowerCase();
        if (["cancelled", "completed", "expired", "deleted"].includes(pStatus)) {
          await client.query(
            `UPDATE medicine_reminders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
            [row.reminder_id],
          );
          cancelledCount++;
          continue;
        }

        // 2. Schedule already TAKEN or SKIPPED
        if (row.schedule_status === "TAKEN" || row.schedule_status === "SKIPPED") {
          await client.query(
            `UPDATE medicine_reminders SET status = 'SKIPPED', updated_at = NOW() WHERE id = $1`,
            [row.reminder_id],
          );
          skippedCount++;
          continue;
        }

        // 3. Dispatch dose reminder notification
        const medName = row.medicine_name || "Prescribed Medicine";
        const cleanTime = row.scheduled_time || "scheduled time";
        const foodPart = row.food_instruction ? ` • ${row.food_instruction}` : "";
        const dosePart = row.dosage ? ` (${row.dosage}${foodPart})` : "";
        const title = `💊  medicine: ${medName}`;
        const body = `Hi, your ${cleanTime} dose of ${medName}${dosePart} is due now. Tap to log your dose.`;

        try {
          await notificationService.sendToPatient(row.patient_id, {
            type: NotificationType.MEDICINE_REMINDER,
            title,
            body,
            entityType: "MEDICINE_SCHEDULE",
            entityId: row.schedule_id,
            route: "MedicineTracking",
            idempotencyKey: row.idempotency_key,
            data: {
              type: NotificationType.MEDICINE_REMINDER,
              scheduleId: row.schedule_id,
              prescriptionId: row.prescription_id,
              medicineName: medName,
              scheduledTime: cleanTime,
              screen: "MedicineTracking",
            },
          });

          await client.query(
            `UPDATE medicine_reminders SET status = 'SENT', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [row.reminder_id],
          );
          sentCount++;
        } catch (sendErr) {
          logger.error(
            { sendErr, reminderId: row.reminder_id },
            "[MedicineReminder] Failed to send dose reminder notification",
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err }, "[MedicineReminder] Error processing due reminders");
    } finally {
      client.release();
    }

    return { processedCount, sentCount, skippedCount, cancelledCount };
  }

  /**
   * Process missed doses: checks doses that are overdue past the grace period (2 hours).
   * Transitions status from PENDING to MISSED, and dispatches a single missed-dose alert.
   * Safety invariant: doses already marked TAKEN or SKIPPED are NEVER modified or notified.
   */
  async processMissedDoses(referenceDate = new Date()): Promise<{
    markedMissedCount: number;
    notifiedCount: number;
  }> {
    const client = await pool.connect();
    let markedMissedCount = 0;
    let notifiedCount = 0;

    try {
      const istDateStr = referenceDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      // Candidates: PENDING doses scheduled for today or earlier with active prescriptions
      const res = await client.query<{
        id: string;
        patient_id: string;
        prescription_id: string;
        medicine_name: string;
        scheduled_date: string;
        scheduled_time: string;
      }>(
        `SELECT 
           ms.id,
           ms.patient_id,
           ms.prescription_id,
           ms.medicine_name,
           ms.scheduled_date,
           ms.scheduled_time
         FROM medicine_schedules ms
         JOIN prescriptions p ON ms.prescription_id = p.id
         WHERE ms.status = 'PENDING'
           AND ms.scheduled_date <= $1
           AND LOWER(p.status) = 'active'
         ORDER BY ms.scheduled_date ASC, ms.scheduled_time ASC
         LIMIT 100`,
        [istDateStr],
      );

      const refMs = referenceDate.getTime();
      const graceMs = MISSED_DOSE_GRACE_MINUTES * 60 * 1000;

      for (const row of res.rows) {
        const dStr = typeof row.scheduled_date === "string"
          ? row.scheduled_date.split("T")[0]
          : (row.scheduled_date as any).toISOString().split("T")[0];

        const scheduledAt = this.parseScheduledDateTimeIST(dStr, row.scheduled_time);
        const overdueLimit = scheduledAt.getTime() + graceMs;

        if (refMs >= overdueLimit) {
          // Atomically update status to MISSED if still PENDING
          const updateRes = await client.query(
            `UPDATE medicine_schedules
             SET status = 'MISSED',
                 missed_at = COALESCE(missed_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1 AND status = 'PENDING'
             RETURNING id, patient_id, medicine_name, scheduled_time`,
            [row.id],
          );

          if ((updateRes.rowCount ?? 0) > 0) {
            markedMissedCount++;

            // Dispatch missed dose notification via medicine_reminders
            const cleanTime = (row.scheduled_time || "dose").replace(/\s+/g, "_");
            const idempotencyKey = `med_rem:missed:${row.id}:${dStr}:${cleanTime}`;

            const remInsert = await client.query(
              `INSERT INTO medicine_reminders 
                 (patient_id, prescription_id, schedule_id, reminder_type, scheduled_for, status, idempotency_key)
               VALUES ($1, $2, $3, 'DOSE_MISSED', NOW(), 'PENDING', $4)
               ON CONFLICT (idempotency_key) DO NOTHING
               RETURNING id`,
              [row.patient_id, row.prescription_id, row.id, idempotencyKey],
            );

            if ((remInsert.rowCount ?? 0) > 0) {
              const reminderId = remInsert.rows[0].id;
              const title = `⚠️ Missed dose: ${row.medicine_name}`;
              const body = `You missed your ${row.scheduled_time} dose of ${row.medicine_name}. Tap to view or log.`;

              try {
                await notificationService.sendToPatient(row.patient_id, {
                  type: NotificationType.MEDICINE_REMINDER,
                  title,
                  body,
                  entityType: "MEDICINE_SCHEDULE",
                  entityId: row.id,
                  route: "MedicineTracking",
                  idempotencyKey,
                  data: {
                    type: NotificationType.MEDICINE_REMINDER,
                    scheduleId: row.id,
                    medicineName: row.medicine_name,
                    scheduledTime: row.scheduled_time,
                    screen: "MedicineTracking",
                    isMissed: "true",
                  },
                });

                await client.query(
                  `UPDATE medicine_reminders SET status = 'SENT', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
                  [reminderId],
                );
                notifiedCount++;
              } catch (notifErr) {
                logger.error(
                  { notifErr, scheduleId: row.id },
                  "[MedicineReminder] Failed to send missed dose alert",
                );
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "[MedicineReminder] Error in missed doses processor");
    } finally {
      client.release();
    }

    return { markedMissedCount, notifiedCount };
  }

  /**
   * Process daily morning schedule reminder (at 8:00 AM IST) for patients with doses scheduled today.
   */
  async processDailyMorningSchedules(referenceDate = new Date()): Promise<{
    patientCount: number;
  }> {
    const client = await pool.connect();
    let patientCount = 0;

    try {
      const istDateStr = referenceDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      const duePatients = await client.query<{
        patient_id: string;
        prescription_id: string;
        total_doses: string;
        med_names: string;
      }>(
        `SELECT 
           ms.patient_id,
           MIN(ms.prescription_id::text) AS prescription_id,
           COUNT(ms.id) AS total_doses,
           STRING_AGG(DISTINCT ms.medicine_name, ', ' ORDER BY ms.medicine_name) AS med_names
         FROM medicine_schedules ms
         JOIN prescriptions p ON ms.prescription_id = p.id
         WHERE ms.scheduled_date = $1
           AND LOWER(p.status) = 'active'
         GROUP BY ms.patient_id
         HAVING COUNT(ms.id) > 0
         LIMIT 50`,
        [istDateStr],
      );

      for (const row of duePatients.rows) {
        const total = parseInt(row.total_doses, 10) || 1;
        const key = `med_rem:daily:${row.patient_id}:${istDateStr}`;

        const insertRes = await client.query(
          `INSERT INTO medicine_reminders 
             (patient_id, prescription_id, reminder_type, scheduled_for, status, idempotency_key)
           VALUES ($1, $2, 'DAILY_SCHEDULE', NOW(), 'PENDING', $3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [row.patient_id, row.prescription_id, key],
        );

        if ((insertRes.rowCount ?? 0) === 0) {
          continue;
        }

        const reminderId = insertRes.rows[0].id;
        const title = `🌅 Today's Medication Schedule (${total} dose${total > 1 ? "s" : ""})`;
        const body = `Good morning! You have ${total} dose${total > 1 ? "s" : ""} scheduled today (${row.med_names}). Tap to view your medication timeline.`;

        try {
          await notificationService.sendToPatient(row.patient_id, {
            type: NotificationType.MEDICINE_REMINDER,
            title,
            body,
            entityType: "MEDICINE_SCHEDULE",
            entityId: istDateStr,
            route: "MedicineTracking",
            idempotencyKey: key,
            data: {
              type: NotificationType.MEDICINE_REMINDER,
              date: istDateStr,
              screen: "MedicineTracking",
              initialTab: "today",
            },
          });

          await client.query(
            `UPDATE medicine_reminders SET status = 'SENT', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [reminderId],
          );
          patientCount++;
        } catch (err) {
          logger.error(
            { err, patientId: row.patient_id },
            "[MedicineReminder] Failed to send daily morning schedule reminder",
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "[MedicineReminder] Error in daily morning schedules processor");
    } finally {
      client.release();
    }

    return { patientCount };
  }

  /**
   * Process low-supply and course-ending reminders for active prescriptions nearing completion.
   */
  async processCourseEndingAlerts(referenceDate = new Date()): Promise<{
    alertedCount: number;
  }> {
    const client = await pool.connect();
    let alertedCount = 0;

    try {
      const istDateStr = referenceDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

      const endingPrescriptions = await client.query<{
        prescription_id: string;
        patient_id: string;
        medicine_name: string;
        max_date: string;
      }>(
        `SELECT 
           ms.prescription_id,
           ms.patient_id,
           ms.medicine_name,
           MAX(ms.scheduled_date)::text AS max_date
         FROM medicine_schedules ms
         JOIN prescriptions p ON ms.prescription_id = p.id
         WHERE LOWER(p.status) = 'active'
           AND ms.scheduled_date >= $1
         GROUP BY ms.prescription_id, ms.patient_id, ms.medicine_name
         HAVING MAX(ms.scheduled_date) <= ($1::date + INTERVAL '2 days')
         LIMIT 30`,
        [istDateStr],
      );

      for (const row of endingPrescriptions.rows) {
        const medKey = row.medicine_name.toLowerCase().replace(/\s+/g, "_");
        const idempotencyKey = `med_rem:course_ending:${row.prescription_id}:${medKey}`;

        const insertRes = await client.query(
          `INSERT INTO medicine_reminders 
             (patient_id, prescription_id, reminder_type, scheduled_for, status, idempotency_key)
           VALUES ($1, $2, 'COURSE_ENDING', NOW(), 'PENDING', $3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [row.patient_id, row.prescription_id, idempotencyKey],
        );

        if ((insertRes.rowCount ?? 0) === 0) {
          continue;
        }

        const reminderId = insertRes.rows[0].id;
        const title = `📦 Medicine Supply Running Low: ${row.medicine_name}`;
        const body = `You are nearing the end of your course for ${row.medicine_name}. Tap to reorder from our pharmacy.`;

        try {
          await notificationService.sendToPatient(row.patient_id, {
            type: NotificationType.MEDICINE_ORDER_CONFIRMED,
            title,
            body,
            entityType: "PRESCRIPTION",
            entityId: row.prescription_id,
            route: "OrderFromPharmacy",
            idempotencyKey,
            data: {
              type: "MEDICINE_SUPPLY_LOW",
              prescriptionId: row.prescription_id,
              medicineName: row.medicine_name,
              screen: "OrderFromPharmacy",
            },
          });

          await client.query(
            `UPDATE medicine_reminders SET status = 'SENT', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [reminderId],
          );
          alertedCount++;
        } catch (err) {
          logger.error(
            { err, prescriptionId: row.prescription_id },
            "[MedicineReminder] Failed to send supply ending reminder",
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "[MedicineReminder] Error in course ending alerts processor");
    } finally {
      client.release();
    }

    return { alertedCount };
  }

  /**
   * Master sweep method called periodically by background worker.
   */
  async sweepAllMedicineReminders(): Promise<void> {
    const now = new Date();

    // 1. Process due dose reminders
    await this.processDueReminders(now);

    // 2. Process missed doses
    await this.processMissedDoses(now);

    // 3. Morning schedule summary check (around 08:00 AM IST)
    const istHour = parseInt(
      now.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }),
      10,
    );
    if (istHour >= 8 && istHour < 10) {
      await this.processDailyMorningSchedules(now);
    }

    // 4. Course ending alerts (at 10 AM or 4 PM IST)
    if (istHour === 10 || istHour === 16) {
      await this.processCourseEndingAlerts(now);
    }
  }

  startWorker(intervalMs = 60_000): void {
    if (process.env["NODE_ENV"] === "test") {
      return;
    }
    if (this.timer) {
      return;
    }

    logger.info("[MedicineReminderService] Starting medicine reminder background worker");
    void this.sweepAllMedicineReminders().catch((err) => {
      logger.error({ err }, "[MedicineReminderService] Error in initial reminder run");
    });

    this.timer = setInterval(() => {
      if (this.isRunning) return;
      this.isRunning = true;
      this.sweepAllMedicineReminders()
        .catch((err) => {
          logger.error({ err }, "[MedicineReminderService] Error in periodic reminder run");
        })
        .finally(() => {
          this.isRunning = false;
        });
    }, intervalMs);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("[MedicineReminderService] Medicine reminder background worker stopped");
    }
  }
}

export const medicineReminderService = new MedicineReminderService();
