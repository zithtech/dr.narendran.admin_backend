import { medicineReminderService } from "./medicineReminder.service.js";
import { pool } from '@/db/pool.js';
import { ForbiddenError, NotFoundError } from '@/http/errors.js';
import { logger } from '@/lib/logger.js';

export const GRACE_PERIOD_HOURS = 2;

export interface MedicineScheduleItem {
  id: string;
  patient_id: string;
  prescription_id: string;
  prescription_medicine_id?: string | undefined;
  medicine_id?: string | undefined;
  medicine_name: string;
  dosage?: string | undefined;
  dose_quantity?: string | undefined;
  frequency?: string | undefined;
  duration?: string | undefined;
  food_instruction?: string | undefined;
  instructions?: string | undefined;
  scheduled_date: string;
  scheduled_time: string;
  status: 'PENDING' | 'TAKEN' | 'MISSED' | 'SKIPPED';
  taken_at?: string | undefined;
  missed_at?: string | undefined;
  skipped_at?: string | undefined;
  skip_reason?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface DailyAdherenceSummary {
  date: string;
  total_scheduled: number;
  taken: number;
  missed: number;
  pending: number;
  skipped: number;
  adherence_percent: number;
  next_dose?: MedicineScheduleItem | null | undefined;
  doses: MedicineScheduleItem[];
}

export interface MedicineAdherenceStat {
  medicine_name: string;
  dosage?: string | undefined;
  frequency?: string | undefined;
  duration?: string | undefined;
  food_instruction?: string | undefined;
  instructions?: string | undefined;
  total_doses: number;
  taken_doses: number;
  missed_doses: number;
  skipped_doses: number;
  pending_doses: number;
  adherence_percent: number;
  today_doses?: MedicineScheduleItem[] | undefined;
  all_doses?: MedicineScheduleItem[] | undefined;
  history?: {
    date: string;
    status: string;
    scheduled_time: string;
    taken_at?: string | undefined;
  }[] | undefined;
}

export class MedicineScheduleService {
  parseFrequencyToTimes(frequency?: string, foodInstruction?: string): string[] {
    const freq = (frequency || '').toLowerCase().trim();
    const food = (foodInstruction || '').toLowerCase().trim();
    if (!freq && !food) return ['08:00 AM'];

    if (freq.includes('four') || freq.includes('4 time') || freq === 'qid' || freq.includes('4x') || freq.includes('every 6')) {
      return ['08:00 AM', '12:00 PM', '04:00 PM', '08:00 PM'];
    }

    if (freq.includes('three') || freq.includes('3 time') || freq === 'tds' || freq === 'tid' || freq.includes('3x') || freq.includes('every 8')) {
      return ['08:00 AM', '01:00 PM', '08:00 PM'];
    }

    if (freq.includes('twice') || freq.includes('2 time') || freq === 'bd' || freq === 'bid' || freq.includes('2x')) {
      return ['08:00 AM', '08:00 PM'];
    }

    if (freq.includes('morning') || food.includes('breakfast')) {
      return ['08:00 AM'];
    }

    if (freq.includes('afternoon') || food.includes('lunch')) {
      return ['01:00 PM'];
    }

    if (freq.includes('evening') || food.includes('dinner')) {
      return ['08:00 PM'];
    }

    if (freq.includes('bedtime') || freq.includes('night')) {
      return ['10:00 PM'];
    }

    return ['08:00 AM'];
  }

  parseDurationToDays(duration?: string): number {
    if (!duration) return 5;
    const dur = duration.toLowerCase().trim();

    const monthMatch = /(\d+)\s*month/.exec(dur);
    if (monthMatch?.[1]) return Math.min(parseInt(monthMatch[1], 10) * 30, 90);

    const weekMatch = /(\d+)\s*week/.exec(dur);
    if (weekMatch?.[1]) return Math.min(parseInt(weekMatch[1], 10) * 7, 90);

    const dayMatch = /(\d+)\s*day/.exec(dur);
    if (dayMatch?.[1]) return Math.min(parseInt(dayMatch[1], 10), 90);

    if (dur === '1 month') return 30;
    if (dur === '2 weeks') return 14;
    if (dur === '1 week') return 7;

    return 5;
  }

  async generateScheduleForPrescription(prescriptionId: string, existingClient?: any): Promise<number> {
    const client = existingClient || (await pool.connect());
    const shouldRelease = !existingClient;

    try {
      const rxRes = await client.query(
        'SELECT id, patient_id, prescription_date, status FROM prescriptions WHERE id = $1',
        [prescriptionId]
      );
      if (rxRes.rows.length === 0) return 0;
      const rx = rxRes.rows[0];

      if (['cancelled', 'deleted', 'invalid'].includes((rx.status || '').toLowerCase())) {
        return 0;
      }

      const medRes = await client.query(
        'SELECT * FROM prescription_medicines WHERE prescription_id = $1 ORDER BY created_at ASC',
        [prescriptionId]
      );

      if (medRes.rows.length === 0) return 0;

      let baseDate = new Date();
      if (rx.prescription_date) {
        const parsed = new Date(rx.prescription_date);
        if (!isNaN(parsed.getTime())) {
          baseDate = parsed;
        }
      }

      let insertedCount = 0;

      for (const med of medRes.rows) {
        const days = this.parseDurationToDays(med.duration);
        const times = this.parseFrequencyToTimes(med.frequency, med.food_instruction);

        for (let dayOffset = 0; dayOffset < days; dayOffset++) {
          const schedDate = new Date(baseDate.getTime());
          schedDate.setDate(schedDate.getDate() + dayOffset);
          const dateStr = schedDate.toISOString().split('T')[0] ?? '';

          for (const timeStr of times) {
            const insertRes = await client.query(
              `INSERT INTO medicine_schedules
                  (patient_id, prescription_id, prescription_medicine_id, medicine_id,
                   medicine_name, dosage, dose_quantity, frequency, duration,
                   food_instruction, instructions, scheduled_date, scheduled_time, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING')
                ON CONFLICT (patient_id, prescription_id, medicine_name, scheduled_date, scheduled_time)
                DO NOTHING
                RETURNING id`,
              [
                rx.patient_id,
                rx.id,
                med.id || null,
                med.medicine_id || null,
                med.medicine_name,
                med.dosage || null,
                med.prescribed_quantity ? String(med.prescribed_quantity) : '1',
                med.frequency || null,
                med.duration || null,
                med.food_instruction || null,
                med.instructions || null,
                dateStr,
                timeStr,
              ]
            );
            if (insertRes.rows.length > 0) {
              insertedCount++;
            }
          }
        }
      }

      logger.info({ prescriptionId, insertedCount }, 'Generated medicine schedules for prescription');

      // Schedule proactive reminders in medicine_reminders
      try {
        void medicineReminderService.scheduleRemindersForPrescription(prescriptionId);
      } catch (remErr) {
        logger.warn({ remErr, prescriptionId }, 'Failed to schedule medicine reminders');
      }

      return insertedCount;
    } finally {
      if (shouldRelease) {
        client.release();
      }
    }
  }

  parseScheduledDateTime(dateStr: string, timeStr: string): Date {
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

    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minsStr = String(minutes).padStart(2, '0');

    // Parse explicitly with Asia/Kolkata offset (+05:30) to preserve correct local time across UTC hosts
    const isoString = `${year}-${monthStr}-${dayStr}T${hoursStr}:${minsStr}:00+05:30`;
    return new Date(isoString);
  }

  async processMissedDoses(patientId?: string): Promise<number> {
    const client = await pool.connect();
    try {
      const whereClause = patientId
        ? "WHERE ms.status = 'PENDING' AND LOWER(p.status) = 'active' AND (ms.patient_id::text = $1 OR ms.patient_id IN (SELECT id FROM patients WHERE user_account_id::text = $1 OR user_id::text = $1))"
        : "WHERE ms.status = 'PENDING' AND LOWER(p.status) = 'active'";
      const params = patientId ? [patientId] : [];

      const res = await client.query(
        `SELECT ms.id, ms.scheduled_date, ms.scheduled_time 
         FROM medicine_schedules ms
         JOIN prescriptions p ON ms.prescription_id = p.id
         ${whereClause}`,
        params
      );

      const now = new Date();
      const gracePeriodMs = GRACE_PERIOD_HOURS * 60 * 60 * 1000;
      const missedIds: string[] = [];

      for (const row of res.rows) {
        const dStr = typeof row.scheduled_date === 'string'
          ? (row.scheduled_date.split('T')[0] ?? '')
          : (row.scheduled_date ? (row.scheduled_date.toISOString().split('T')[0] ?? '') : '');
        if (!dStr) continue;

        const schedTime = this.parseScheduledDateTime(dStr, row.scheduled_time);
        if (schedTime.getTime() + gracePeriodMs < now.getTime()) {
          missedIds.push(row.id);
        }
      }

      if (missedIds.length > 0) {
        await client.query(
          `UPDATE medicine_schedules
              SET status = 'MISSED', missed_at = NOW(), updated_at = NOW()
            WHERE id = ANY($1::uuid[])`,
          [missedIds]
        );
        logger.info({ count: missedIds.length }, 'Processed overdue medicine doses as MISSED');
      }

      return missedIds.length;
    } finally {
      client.release();
    }
  }

  async resolvePatientId(inputId: string): Promise<string> {
    const client = await pool.connect();
    try {
      const pRes = await client.query(
        `SELECT id, user_account_id, user_id FROM patients
          WHERE (user_account_id IS NOT NULL AND user_account_id::text = $1)
             OR (user_id IS NOT NULL AND user_id::text = $1)
             OR (id::text = $1)
          LIMIT 1`,
        [inputId]
      );
      if (pRes.rows.length > 0) {
        // Return user_account_id because prescriptions and medicine_schedules use it as patient_id
        return String(pRes.rows[0].user_account_id || pRes.rows[0].id);
      }
      return inputId;
    } finally {
      client.release();
    }
  }

  async ensureSchedulesExist(resolvedPatientId: string, authUserId: string): Promise<void> {
    const client = await pool.connect();
    try {
      const rxRes = await client.query(
        `SELECT p.id FROM prescriptions p
          WHERE (p.patient_id::text = $1 OR p.patient_id::text = $2)
            AND LOWER(p.status) = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM medicine_schedules ms WHERE ms.prescription_id = p.id
            )`,
        [resolvedPatientId, authUserId]
      );

      for (const row of rxRes.rows) {
        await this.generateScheduleForPrescription(row.id, client);
      }
    } finally {
      client.release();
    }
  }

  async getTodaySchedule(authUserId: string): Promise<DailyAdherenceSummary> {
    const resolvedPatientId = await this.resolvePatientId(authUserId);
    await this.ensureSchedulesExist(resolvedPatientId, authUserId);
    await this.processMissedDoses(resolvedPatientId);

    const client = await pool.connect();
    try {
      const todayStr = new Date().toISOString().split('T')[0] ?? '';

      const res = await client.query(
        `SELECT ms.* FROM medicine_schedules ms
         JOIN prescriptions p ON ms.prescription_id = p.id
         WHERE (ms.patient_id::text = $1 OR ms.patient_id::text = $2)
           AND ms.scheduled_date = $3
           AND LOWER(p.status) = 'active'
         ORDER BY ms.scheduled_time ASC, ms.created_at ASC`,
        [resolvedPatientId, authUserId, todayStr]
      );

      const doses: MedicineScheduleItem[] = res.rows.map(r => ({
        id: r.id,
        patient_id: r.patient_id,
        prescription_id: r.prescription_id,
        prescription_medicine_id: r.prescription_medicine_id ?? undefined,
        medicine_id: r.medicine_id ?? undefined,
        medicine_name: r.medicine_name,
        dosage: r.dosage ?? undefined,
        dose_quantity: r.dose_quantity ?? undefined,
        frequency: r.frequency ?? undefined,
        duration: r.duration ?? undefined,
        food_instruction: r.food_instruction ?? undefined,
        instructions: r.instructions ?? undefined,
        scheduled_date: typeof r.scheduled_date === 'string' ? (r.scheduled_date.split('T')[0] ?? '') : (r.scheduled_date.toISOString().split('T')[0] ?? ''),
        scheduled_time: r.scheduled_time,
        status: r.status,
        taken_at: r.taken_at ? r.taken_at.toISOString() : undefined,
        missed_at: r.missed_at ? r.missed_at.toISOString() : undefined,
        skipped_at: r.skipped_at ? r.skipped_at.toISOString() : undefined,
        skip_reason: r.skip_reason ?? undefined,
        created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updated_at: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      }));

      let taken = 0;
      let missed = 0;
      let pending = 0;
      let skipped = 0;
      let nextDose: MedicineScheduleItem | null = null;

      for (const dose of doses) {
        if (dose.status === 'TAKEN') taken++;
        else if (dose.status === 'MISSED') missed++;
        else if (dose.status === 'SKIPPED') skipped++;
        else if (dose.status === 'PENDING') {
          pending++;
          if (!nextDose) nextDose = dose;
        }
      }

      const eligiblePast = taken + missed;
      const adherencePercent = eligiblePast > 0
        ? Math.round((taken / eligiblePast) * 100)
        : (doses.length > 0 && taken > 0 ? Math.round((taken / doses.length) * 100) : 100);

      return {
        date: todayStr,
        total_scheduled: doses.length,
        taken,
        missed,
        pending,
        skipped,
        adherence_percent: adherencePercent,
        next_dose: nextDose,
        doses,
      };
    } finally {
      client.release();
    }
  }

  async markDoseAsTaken(scheduleId: string, authUserId: string): Promise<MedicineScheduleItem> {
    const resolvedPatientId = await this.resolvePatientId(authUserId);
    const client = await pool.connect();
    try {
      const checkRes = await client.query(
        'SELECT id, patient_id FROM medicine_schedules WHERE id = $1',
        [scheduleId]
      );
      if (checkRes.rows.length === 0) {
        throw new NotFoundError('Medicine dose schedule not found.');
      }

      const row = checkRes.rows[0];
      if (String(row.patient_id) !== resolvedPatientId && String(row.patient_id) !== authUserId) {
        throw new ForbiddenError('You do not have permission to update this dose.');
      }

      const updateRes = await client.query(
        `UPDATE medicine_schedules
            SET status = 'TAKEN', taken_at = NOW(), missed_at = NULL, skipped_at = NULL, skip_reason = NULL, updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [scheduleId]
      );

      const r = updateRes.rows[0];

      // If there was an active non-adherence alert for this prescription, mark it resolved
      if (r?.prescription_id) {
        await client.query(
          `UPDATE patient_adherence_alerts
              SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW()
            WHERE prescription_id = $1 AND status = 'ACTIVE'`,
          [r.prescription_id],
        );
        await client.query(
          `UPDATE prescriptions
              SET non_adherence_resolved_at = NOW()
            WHERE id = $1`,
          [r.prescription_id],
        );
      }

      return {
        id: r.id,
        patient_id: r.patient_id,
        prescription_id: r.prescription_id,
        prescription_medicine_id: r.prescription_medicine_id ?? undefined,
        medicine_id: r.medicine_id ?? undefined,
        medicine_name: r.medicine_name,
        dosage: r.dosage ?? undefined,
        dose_quantity: r.dose_quantity ?? undefined,
        frequency: r.frequency ?? undefined,
        duration: r.duration ?? undefined,
        food_instruction: r.food_instruction ?? undefined,
        instructions: r.instructions ?? undefined,
        scheduled_date: typeof r.scheduled_date === 'string' ? (r.scheduled_date.split('T')[0] ?? '') : (r.scheduled_date.toISOString().split('T')[0] ?? ''),
        scheduled_time: r.scheduled_time,
        status: r.status,
        taken_at: r.taken_at ? r.taken_at.toISOString() : undefined,
        missed_at: r.missed_at ? r.missed_at.toISOString() : undefined,
        skipped_at: r.skipped_at ? r.skipped_at.toISOString() : undefined,
        skip_reason: r.skip_reason ?? undefined,
        created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updated_at: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async skipDose(scheduleId: string, authUserId: string, skipReason?: string): Promise<MedicineScheduleItem> {
    const resolvedPatientId = await this.resolvePatientId(authUserId);
    const client = await pool.connect();
    try {
      const checkRes = await client.query(
        'SELECT id, patient_id FROM medicine_schedules WHERE id = $1',
        [scheduleId]
      );
      if (checkRes.rows.length === 0) {
        throw new NotFoundError('Medicine dose schedule not found.');
      }

      const row = checkRes.rows[0];
      if (String(row.patient_id) !== resolvedPatientId && String(row.patient_id) !== authUserId) {
        throw new ForbiddenError('You do not have permission to update this dose.');
      }

      const updateRes = await client.query(
        `UPDATE medicine_schedules
            SET status = 'SKIPPED', skipped_at = NOW(), skip_reason = $2, missed_at = NULL, taken_at = NULL, updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [scheduleId, skipReason || 'Skipped by patient']
      );

      const r = updateRes.rows[0];
      return {
        id: r.id,
        patient_id: r.patient_id,
        prescription_id: r.prescription_id,
        prescription_medicine_id: r.prescription_medicine_id ?? undefined,
        medicine_id: r.medicine_id ?? undefined,
        medicine_name: r.medicine_name,
        dosage: r.dosage ?? undefined,
        dose_quantity: r.dose_quantity ?? undefined,
        frequency: r.frequency ?? undefined,
        duration: r.duration ?? undefined,
        food_instruction: r.food_instruction ?? undefined,
        instructions: r.instructions ?? undefined,
        scheduled_date: typeof r.scheduled_date === 'string' ? (r.scheduled_date.split('T')[0] ?? '') : (r.scheduled_date.toISOString().split('T')[0] ?? ''),
        scheduled_time: r.scheduled_time,
        status: r.status,
        taken_at: r.taken_at ? r.taken_at.toISOString() : undefined,
        missed_at: r.missed_at ? r.missed_at.toISOString() : undefined,
        skipped_at: r.skipped_at ? r.skipped_at.toISOString() : undefined,
        skip_reason: r.skip_reason ?? undefined,
        created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updated_at: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async getAdherenceHistory(authUserId: string, timeRange?: string, medicineFilter?: string): Promise<{
    overall_adherence: number;
    total_scheduled: number;
    total_taken: number;
    total_missed: number;
    total_skipped: number;
    total_pending: number;
    daily_history: {
      date: string;
      total: number;
      taken: number;
      missed: number;
      skipped: number;
      pending: number;
      adherence_percent: number;
      doses: MedicineScheduleItem[];
    }[];
    medicines: MedicineAdherenceStat[];
  }> {
    const resolvedPatientId = await this.resolvePatientId(authUserId);
    await this.ensureSchedulesExist(resolvedPatientId, authUserId);
    await this.processMissedDoses(resolvedPatientId);

    const client = await pool.connect();
    try {
      const now = new Date();
      let fromDate: string | null = null;

      if (timeRange === '7days') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        fromDate = d.toISOString().split('T')[0] ?? null;
      } else if (timeRange === '30days') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        fromDate = d.toISOString().split('T')[0] ?? null;
      } else if (timeRange === 'today') {
        fromDate = now.toISOString().split('T')[0] ?? null;
      }
      const whereClauses: string[] = [
        '(ms.patient_id::text = $1 OR ms.patient_id::text = $2)',
        "LOWER(p.status) NOT IN ('cancelled', 'deleted', 'invalid')",
      ];
      const params: any[] = [resolvedPatientId, authUserId];
      let paramIdx = 3;

      if (fromDate) {
        whereClauses.push(`ms.scheduled_date >= $${paramIdx}`);
        params.push(fromDate);
        paramIdx++;
      }

      if (medicineFilter) {
        whereClauses.push(`LOWER(ms.medicine_name) = $${paramIdx}`);
        params.push(medicineFilter.toLowerCase());
        paramIdx++;
      }
      const query = `
        SELECT ms.* FROM medicine_schedules ms
        JOIN prescriptions p ON ms.prescription_id = p.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ms.scheduled_date DESC, ms.scheduled_time ASC
      `;

      const { rows } = await client.query(query, params);

      const items: MedicineScheduleItem[] = rows.map(r => ({
        id: r.id,
        patient_id: r.patient_id,
        prescription_id: r.prescription_id,
        prescription_medicine_id: r.prescription_medicine_id ?? undefined,
        medicine_id: r.medicine_id ?? undefined,
        medicine_name: r.medicine_name,
        dosage: r.dosage ?? undefined,
        dose_quantity: r.dose_quantity ?? undefined,
        frequency: r.frequency ?? undefined,
        duration: r.duration ?? undefined,
        food_instruction: r.food_instruction ?? undefined,
        instructions: r.instructions ?? undefined,
        scheduled_date: typeof r.scheduled_date === 'string' ? (r.scheduled_date.split('T')[0] ?? '') : (r.scheduled_date.toISOString().split('T')[0] ?? ''),
        scheduled_time: r.scheduled_time,
        status: r.status,
        taken_at: r.taken_at ? r.taken_at.toISOString() : undefined,
        missed_at: r.missed_at ? r.missed_at.toISOString() : undefined,
        skipped_at: r.skipped_at ? r.skipped_at.toISOString() : undefined,
        skip_reason: r.skip_reason ?? undefined,
        created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        updated_at: r.updated_at ? r.updated_at.toISOString() : new Date().toISOString(),
      }));

      const dateMap = new Map<string, MedicineScheduleItem[]>();
      for (const item of items) {
        if (!dateMap.has(item.scheduled_date)) {
          dateMap.set(item.scheduled_date, []);
        }
        dateMap.get(item.scheduled_date)!.push(item);
      }

      const dailyHistory: {
        date: string;
        total: number;
        taken: number;
        missed: number;
        skipped: number;
        pending: number;
        adherence_percent: number;
        doses: MedicineScheduleItem[];
      }[] = [];

      for (const [date, doses] of dateMap.entries()) {
        let t = 0, m = 0, s = 0, p = 0;
        for (const d of doses) {
          if (d.status === 'TAKEN') t++;
          else if (d.status === 'MISSED') m++;
          else if (d.status === 'SKIPPED') s++;
          else if (d.status === 'PENDING') p++;
        }
        const eligible = t + m;
        const adh = eligible > 0 ? Math.round((t / eligible) * 100) : (doses.length > 0 && t > 0 ? Math.round((t / doses.length) * 100) : 100);
        dailyHistory.push({
          date,
          total: doses.length,
          taken: t,
          missed: m,
          skipped: s,
          pending: p,
          adherence_percent: adh,
          doses,
        });
      }

      const medMap = new Map<string, MedicineScheduleItem[]>();
      for (const item of items) {
        const key = item.medicine_name;
        if (!medMap.has(key)) {
          medMap.set(key, []);
        }
        medMap.get(key)!.push(item);
      }

      const todayStr = new Date().toISOString().split('T')[0] ?? '';
      const medicines: MedicineAdherenceStat[] = [];
      for (const [medName, doses] of medMap.entries()) {
        let t = 0, m = 0, s = 0, p = 0;
        const todayDoses: MedicineScheduleItem[] = [];
        const hist: { date: string; status: string; scheduled_time: string; taken_at?: string | undefined }[] = [];

        for (const d of doses) {
          if (d.status === 'TAKEN') t++;
          else if (d.status === 'MISSED') m++;
          else if (d.status === 'SKIPPED') s++;
          else if (d.status === 'PENDING') p++;

          if (d.scheduled_date === todayStr) {
            todayDoses.push(d);
          }
          hist.push({
            date: d.scheduled_date,
            status: d.status,
            scheduled_time: d.scheduled_time,
            taken_at: d.taken_at,
          });
        }

        const eligible = t + m;
        const adh = eligible > 0 ? Math.round((t / eligible) * 100) : 100;
        const sample = doses[0];

        medicines.push({
          medicine_name: medName,
          dosage: sample?.dosage,
          frequency: sample?.frequency,
          duration: sample?.duration,
          food_instruction: sample?.food_instruction,
          instructions: sample?.instructions,
          total_doses: doses.length,
          taken_doses: t,
          missed_doses: m,
          skipped_doses: s,
          pending_doses: p,
          adherence_percent: adh,
          today_doses: todayDoses,
          all_doses: doses,
          history: hist.slice(0, 10),
        });
      }

      let totalTaken = 0, totalMissed = 0, totalSkipped = 0, totalPending = 0;
      for (const i of items) {
        if (i.status === 'TAKEN') totalTaken++;
        else if (i.status === 'MISSED') totalMissed++;
        else if (i.status === 'SKIPPED') totalSkipped++;
        else if (i.status === 'PENDING') totalPending++;
      }
      const overallEligible = totalTaken + totalMissed;
      const overallAdherence = overallEligible > 0
        ? Math.round((totalTaken / overallEligible) * 100)
        : (items.length > 0 && totalTaken > 0 ? 100 : 100);

      return {
        overall_adherence: overallAdherence,
        total_scheduled: items.length,
        total_taken: totalTaken,
        total_missed: totalMissed,
        total_skipped: totalSkipped,
        total_pending: totalPending,
        daily_history: dailyHistory,
        medicines,
      };
    } finally {
      client.release();
    }
  }

  async getDoctorPatientMonitoring(patientId: string): Promise<{
    patient_id: string;
    patient_name?: string | undefined;
    overall_adherence: number;
    today_summary: {
      taken: number;
      missed: number;
      pending: number;
      skipped: number;
      total: number;
    };
    medicines: MedicineAdherenceStat[];
    alerts: {
      id: string;
      medicine_name: string;
      scheduled_date: string;
      scheduled_time: string;
      missed_at?: string | undefined;
      message: string;
    }[];
    active_non_adherence_alert?: {
      id: string;
      consecutive_missed_count: number;
      alerted_at: string;
      message: string;
    } | null | undefined;
  }> {
    const resolvedPatientId = await this.resolvePatientId(patientId);
    await this.processMissedDoses(resolvedPatientId);

    const client = await pool.connect();
    try {
      const pRes = await client.query(
        `SELECT p.id, u.full_name FROM patients p
          LEFT JOIN users u ON p.user_account_id = u.id OR p.user_id = u.id
          WHERE p.id::text = $1 OR p.user_account_id::text = $1 OR p.user_id::text = $1
          LIMIT 1`,
        [resolvedPatientId]
      );
      const patientName = pRes.rows[0]?.full_name || 'Patient';

      const historyData = await this.getAdherenceHistory(resolvedPatientId, '30days');
      const todayStr = new Date().toISOString().split('T')[0] ?? '';
      const todayHistory = historyData.daily_history.find(h => h.date === todayStr);

      const alertRes = await client.query(
        `SELECT id, medicine_name, scheduled_date, scheduled_time, missed_at
          FROM medicine_schedules
          WHERE (patient_id::text = $1 OR patient_id::text = $2)
            AND status = 'MISSED'
            AND scheduled_date >= CURRENT_DATE - INTERVAL '7 days'
          ORDER BY scheduled_date DESC, scheduled_time DESC
          LIMIT 5`,
        [resolvedPatientId, patientId]
      );

      const alerts = alertRes.rows.map(r => ({
        id: r.id,
        medicine_name: r.medicine_name,
        scheduled_date: typeof r.scheduled_date === 'string' ? (r.scheduled_date.split('T')[0] ?? '') : (r.scheduled_date.toISOString().split('T')[0] ?? ''),
        scheduled_time: r.scheduled_time,
        missed_at: r.missed_at ? r.missed_at.toISOString() : undefined,
        message: 'Patient missed ' + r.medicine_name + ' (' + r.scheduled_time + ') dose',
      }));

      const nonAdherenceRes = await client.query(
        `SELECT id, consecutive_missed_count, alerted_at, status
           FROM patient_adherence_alerts
          WHERE (patient_id::text = $1 OR patient_id::text = $2)
            AND status = 'ACTIVE'
          ORDER BY alerted_at DESC
          LIMIT 1`,
        [resolvedPatientId, patientId]
      );
      const activeNonAdherenceAlert = nonAdherenceRes.rows[0] ? {
        id: nonAdherenceRes.rows[0].id,
        consecutive_missed_count: nonAdherenceRes.rows[0].consecutive_missed_count,
        alerted_at: nonAdherenceRes.rows[0].alerted_at ? nonAdherenceRes.rows[0].alerted_at.toISOString() : new Date().toISOString(),
        message: `CRITICAL: Patient has missed ${nonAdherenceRes.rows[0].consecutive_missed_count} consecutive scheduled doses!`,
      } : null;

      return {
        patient_id: resolvedPatientId,
        patient_name: patientName,
        overall_adherence: historyData.overall_adherence,
        today_summary: {
          taken: todayHistory?.taken || 0,
          missed: todayHistory?.missed || 0,
          pending: todayHistory?.pending || 0,
          skipped: todayHistory?.skipped || 0,
          total: todayHistory?.total || 0,
        },
        medicines: historyData.medicines,
        alerts,
        active_non_adherence_alert: activeNonAdherenceAlert,
      };
    } finally {
      client.release();
    }
  }
}

export const medicineScheduleService = new MedicineScheduleService();
