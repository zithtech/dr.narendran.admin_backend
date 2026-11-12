import {pool} from '@/db/pool.js';
import { getDoctorAvailability as getDoctorAvailabilityRepo } from '@/modules/appointments/appointments.repository.js';

export interface CreateAvailabilityInput {
  doctor_id: string;
  branch_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  status: 'ACTIVE' | 'INACTIVE';
  slot_length?: number | undefined;
}

export class DoctorAvailabilityService {
  async getDoctorAvailability(doctorId: string, date: string, locationId?: string | null) {
    return getDoctorAvailabilityRepo(doctorId, date, locationId);
  }

  async getAllAvailabilities(doctorId?: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `
        SELECT 
          a.id,
          a.doctor_id,
          a.branch_id,
          a.day_of_week,
          a.start_time,
          a.end_time,
          a.status,
          COALESCE(a.slot_length, 30) as slot_length,
          a.created_at,
          a.updated_at,
          b.name as branch_name,
          d.name as doctor_name,
          d.specialization as doctor_specialization,
          d.qualification as doctor_qualification,
          d.profile_image_url as doctor_image,
          h.name as hospital_name
        FROM doctor_availability a
        INNER JOIN doctors d ON a.doctor_id = d.id
        INNER JOIN hospital_branches b ON a.branch_id = b.id
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        WHERE ($1::uuid IS NULL OR a.doctor_id = $1)
        ORDER BY 
          d.name ASC,
          CASE a.day_of_week
            WHEN 'MONDAY' THEN 1
            WHEN 'TUESDAY' THEN 2
            WHEN 'WEDNESDAY' THEN 3
            WHEN 'THURSDAY' THEN 4
            WHEN 'FRIDAY' THEN 5
            WHEN 'SATURDAY' THEN 6
            WHEN 'SUNDAY' THEN 7
            ELSE 8
          END,
          a.start_time ASC
      `,
        [doctorId || null],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async getAvailabilityByDoctor(doctorId: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `
        SELECT 
          a.id,
          a.doctor_id,
          a.branch_id,
          a.day_of_week,
          a.start_time,
          a.end_time,
          a.status,
          COALESCE(a.slot_length, 30) as slot_length,
          a.created_at,
          a.updated_at,
          b.name as branch_name,
          d.name as doctor_name,
          d.specialization as doctor_specialization,
          d.qualification as doctor_qualification,
          d.profile_image_url as doctor_image,
          h.name as hospital_name
        FROM doctor_availability a
        INNER JOIN doctors d ON a.doctor_id = d.id
        INNER JOIN hospital_branches b ON a.branch_id = b.id
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        WHERE a.doctor_id = $1
        ORDER BY 
          CASE a.day_of_week
            WHEN 'MONDAY' THEN 1
            WHEN 'TUESDAY' THEN 2
            WHEN 'WEDNESDAY' THEN 3
            WHEN 'THURSDAY' THEN 4
            WHEN 'FRIDAY' THEN 5
            WHEN 'SATURDAY' THEN 6
            WHEN 'SUNDAY' THEN 7
            ELSE 8
          END,
          a.start_time
      `,
        [doctorId],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async createAvailability(data: CreateAvailabilityInput) {
    const client = await pool.connect();
    try {
      const slotLength = data.slot_length && data.slot_length > 0 ? data.slot_length : 30;
      const {rows} = await client.query(
        `INSERT INTO doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time, status, slot_length, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
        [
          data.doctor_id,
          data.branch_id,
          data.day_of_week,
          data.start_time,
          data.end_time,
          data.status,
          slotLength,
        ],
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateAvailability(id: string, data: CreateAvailabilityInput) {
    const client = await pool.connect();
    try {
      const slotLength = data.slot_length && data.slot_length > 0 ? data.slot_length : 30;
      const {rows} = await client.query(
        `UPDATE doctor_availability 
         SET branch_id = $1, day_of_week = $2, start_time = $3, end_time = $4, status = $5, slot_length = $6, updated_at = NOW() 
         WHERE id = $7 RETURNING *`,
        [
          data.branch_id,
          data.day_of_week,
          data.start_time,
          data.end_time,
          data.status,
          slotLength,
          id,
        ],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async updateSlotLengthForDoctor(doctorId: string, slotLength: number) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `UPDATE doctor_availability 
         SET slot_length = $1, updated_at = NOW() 
         WHERE doctor_id = $2 
         RETURNING *`,
        [slotLength, doctorId],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async deleteAvailability(id: string) {
    const client = await pool.connect();
    try {
      const {rowCount} = await client.query(
        'DELETE FROM doctor_availability WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }

  async ensureBlockedDatesTable() {
    const client = await pool.connect();
    try {
      // 1. Create table if not present
      await client.query(`
        CREATE TABLE IF NOT EXISTS doctor_blocked_dates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          doctor_id UUID NOT NULL,
          blocked_date DATE,
          start_time TIME NOT NULL DEFAULT '00:00:00',
          end_time TIME NOT NULL DEFAULT '23:59:59',
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // 2. Ensure all expected columns exist (handles preexisting table from earlier migrations)
      await client.query(`
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS blocked_date DATE;
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS start_time TIME NOT NULL DEFAULT '00:00:00';
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS end_time TIME NOT NULL DEFAULT '23:59:59';
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS reason TEXT;
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE doctor_blocked_dates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      `);

      // 3. Relax older constraints if legacy columns (start_date, end_date) exist
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'doctor_blocked_dates' AND column_name = 'start_date'
          ) THEN
            ALTER TABLE doctor_blocked_dates ALTER COLUMN start_date DROP NOT NULL;
            UPDATE doctor_blocked_dates SET blocked_date = start_date WHERE blocked_date IS NULL;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'doctor_blocked_dates' AND column_name = 'end_date'
          ) THEN
            ALTER TABLE doctor_blocked_dates ALTER COLUMN end_date DROP NOT NULL;
          END IF;
        END $$;
      `);

      // 4. Safely drop foreign key constraint on doctor_id if it references users(id)
      // which fails when referencing doctors table IDs.
      await client.query(`
        DO $$
        DECLARE
          fk_rec RECORD;
        BEGIN
          FOR fk_rec IN (
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'doctor_blocked_dates'::regclass 
              AND contype = 'f'
          ) LOOP
            BEGIN
              EXECUTE format('ALTER TABLE doctor_blocked_dates DROP CONSTRAINT IF EXISTS %I', fk_rec.conname);
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;
          END LOOP;
        END $$;
      `);
    } catch (err) {
      console.error('[DoctorAvailabilityService] Schema setup error on doctor_blocked_dates:', err);
    } finally {
      client.release();
    }
  }

  async getBlockedDatesByDoctor(doctorId: string) {
    await this.ensureBlockedDatesTable();
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{
        id: string;
        doctor_id: string;
        blocked_date: string | Date | null;
        start_date?: string | Date | null;
        start_time: string;
        end_time: string;
        reason: string | null;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `SELECT id, doctor_id, COALESCE(blocked_date, start_date::date) as blocked_date, start_time, end_time, reason, created_at, updated_at
         FROM doctor_blocked_dates
         WHERE doctor_id = $1
         ORDER BY COALESCE(blocked_date, start_date::date) ASC, start_time ASC`,
        [doctorId]
      );

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]!;

      return rows.map((r) => {
        const rawDate = r.blocked_date || r.start_date;
        let bDate = todayStr;
        if (rawDate) {
          bDate =
            typeof rawDate === 'string'
              ? rawDate.split('T')[0]!
              : new Date(rawDate).toISOString().split('T')[0]!;
        }
        const sTime = (r.start_time || '00:00:00').slice(0, 5);
        const eTime = (r.end_time || '23:59:00').slice(0, 5);
        const isAllDay =
          (sTime <= '00:00' && eTime >= '23:59') ||
          (sTime <= '09:00' && eTime >= '17:00');

        let status: 'UPCOMING' | 'TODAY' | 'PAST' = 'UPCOMING';
        if (bDate === todayStr) {
          status = 'TODAY';
        } else if (bDate < todayStr) {
          status = 'PAST';
        }

        return {
          ...r,
          blocked_date: bDate,
          start_time: sTime,
          end_time: eTime,
          is_all_day: isAllDay,
          status,
        };
      });
    } finally {
      client.release();
    }
  }

  async createBlockedDate(data: {
    doctor_id: string;
    blocked_date: string;
    start_time: string;
    end_time: string;
    reason?: string | null | undefined;
  }) {
    await this.ensureBlockedDatesTable();
    const client = await pool.connect();
    try {
      let startTime = data.start_time || '00:00:00';
      let endTime = data.end_time || '23:59:59';
      if (startTime.length === 5) startTime += ':00';
      if (endTime.length === 5) endTime += ':00';

      // Normalize date YYYY-MM-DD
      let normalizedDate = data.blocked_date.trim();
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(normalizedDate)) {
        const parts = normalizedDate.split(/[-/]/);
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // Check if legacy start_date / end_date columns exist
      let hasLegacyCols = false;
      try {
        const checkRes = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'doctor_blocked_dates' AND column_name = 'start_date'`
        );
        hasLegacyCols = (checkRes.rowCount ?? 0) > 0;
      } catch {}

      if (hasLegacyCols) {
        const { rows } = await client.query(
          `INSERT INTO doctor_blocked_dates (doctor_id, blocked_date, start_date, end_date, start_time, end_time, reason, created_at, updated_at)
           VALUES ($1, $2, $2, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [data.doctor_id, normalizedDate, startTime, endTime, data.reason || null]
        );
        return rows[0];
      }

      const { rows } = await client.query(
        `INSERT INTO doctor_blocked_dates (doctor_id, blocked_date, start_time, end_time, reason, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [data.doctor_id, normalizedDate, startTime, endTime, data.reason || null]
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateBlockedDate(
    id: string,
    data: {
      blocked_date?: string | undefined;
      start_time?: string | undefined;
      end_time?: string | undefined;
      reason?: string | null | undefined;
    }
  ) {
    await this.ensureBlockedDatesTable();
    const client = await pool.connect();
    try {
      let startTime = data.start_time;
      let endTime = data.end_time;
      if (startTime && startTime.length === 5) startTime += ':00';
      if (endTime && endTime.length === 5) endTime += ':00';

      let normalizedDate = data.blocked_date?.trim();
      if (normalizedDate && /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(normalizedDate)) {
        const parts = normalizedDate.split(/[-/]/);
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      const { rows } = await client.query(
        `UPDATE doctor_blocked_dates
         SET blocked_date = COALESCE($1, blocked_date),
             start_time = COALESCE($2, start_time),
             end_time = COALESCE($3, end_time),
             reason = COALESCE($4, reason),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [normalizedDate, startTime, endTime, data.reason ?? null, id]
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async deleteBlockedDate(id: string) {
    await this.ensureBlockedDatesTable();
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query(
        'DELETE FROM doctor_blocked_dates WHERE id = $1',
        [id]
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const doctorAvailabilityService = new DoctorAvailabilityService();
