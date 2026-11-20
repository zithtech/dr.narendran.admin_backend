import { pool } from '@/db/pool.js';
import type {
  AttendanceDashboardSummary,
  AttendanceFilterParams,
  AttendancePunch,
  AttendanceRecord,
  AttendanceRegularization,
  AttendanceShift,
  AttendanceStatus,
  GeoLocationPayload,
  PunchMethod,
  PunchType,
  RegularizationStatus,
  RegularizationType,
  UserShiftAssignment,
  UserType,
} from './attendance.types.js';

let tablesEnsured = false;

export async function ensureAttendanceTables(): Promise<void> {
  if (tablesEnsured) return;

  const client = await pool.connect();
  try {
    await client.query(`
      -- 1. Shifts Table
      CREATE TABLE IF NOT EXISTS attendance_shifts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        hospital_id VARCHAR(100) NOT NULL DEFAULT 'default',
        branch_id VARCHAR(100) NULL,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(30) NOT NULL,
        shift_type VARCHAR(30) NOT NULL DEFAULT 'REGULAR',
        applicable_for VARCHAR(20) NOT NULL DEFAULT 'ALL',
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        grace_period_minutes INT NOT NULL DEFAULT 15,
        half_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 4.0,
        full_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 8.0,
        color_code VARCHAR(20) NOT NULL DEFAULT '#2563eb',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_att_shifts_tenant ON attendance_shifts(tenant_id, is_active);

      -- 2. User Shift Assignments
      CREATE TABLE IF NOT EXISTS user_shift_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        user_id UUID NOT NULL,
        shift_id UUID NOT NULL REFERENCES attendance_shifts(id) ON DELETE RESTRICT,
        user_type VARCHAR(20) NOT NULL DEFAULT 'STAFF',
        day_of_week INT NULL,
        specific_date DATE NULL,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE NULL,
        assigned_by UUID NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_shift_assign ON user_shift_assignments(tenant_id, user_id, effective_from);

      -- 3. Daily Attendance Records
      CREATE TABLE IF NOT EXISTS attendance_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        hospital_id VARCHAR(100) NOT NULL DEFAULT 'default',
        branch_id VARCHAR(100) NULL,
        user_id UUID NOT NULL,
        user_type VARCHAR(20) NOT NULL DEFAULT 'STAFF',
        date DATE NOT NULL,
        shift_id UUID REFERENCES attendance_shifts(id) ON DELETE SET NULL,
        check_in_time TIMESTAMPTZ NULL,
        check_out_time TIMESTAMPTZ NULL,
        total_working_minutes INT NOT NULL DEFAULT 0,
        total_break_minutes INT NOT NULL DEFAULT 0,
        overtime_minutes INT NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'ABSENT',
        check_in_method VARCHAR(30) NOT NULL DEFAULT 'WEB_PORTAL',
        check_in_ip VARCHAR(50) NULL,
        check_in_device VARCHAR(255) NULL,
        check_in_location JSONB NULL,
        check_out_location JSONB NULL,
        is_manual_entry BOOLEAN NOT NULL DEFAULT false,
        manual_reason TEXT NULL,
        approved_by UUID NULL,
        remarks TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_att_date UNIQUE (tenant_id, user_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_att_rec_tenant_date ON attendance_records(tenant_id, date);
      CREATE INDEX IF NOT EXISTS idx_att_rec_user_date ON attendance_records(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_att_rec_status ON attendance_records(status);

      -- 4. Audit Trail for All In/Out Punches
      CREATE TABLE IF NOT EXISTS attendance_punches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
        punch_type VARCHAR(20) NOT NULL,
        punched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(50) NULL,
        device_info VARCHAR(255) NULL,
        location JSONB NULL,
        verification_status VARCHAR(20) NOT NULL DEFAULT 'VERIFIED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_att_punches_rec ON attendance_punches(attendance_record_id, punched_at);

      -- 5. Attendance Regularization Requests
      CREATE TABLE IF NOT EXISTS attendance_regularizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'default',
        user_id UUID NOT NULL,
        attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
        date DATE NOT NULL,
        request_type VARCHAR(30) NOT NULL,
        requested_check_in TIMESTAMPTZ NULL,
        requested_check_out TIMESTAMPTZ NULL,
        reason TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        reviewed_by UUID NULL,
        reviewed_at TIMESTAMPTZ NULL,
        rejection_reason TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_att_reg_tenant_status ON attendance_regularizations(tenant_id, status);
    `);

    // Seed default hospital shifts if table is empty
    const { rows: existingShifts } = await client.query('SELECT COUNT(*) FROM attendance_shifts');
    if (parseInt(existingShifts[0]?.count || '0', 10) === 0) {
      await client.query(`
        INSERT INTO attendance_shifts (name, code, shift_type, applicable_for, start_time, end_time, grace_period_minutes, color_code)
        VALUES
          ('General Hospital Shift', 'SH-GEN', 'REGULAR', 'ALL', '09:00:00', '17:00:00', 15, '#2563eb'),
          ('Morning Clinical Shift', 'SH-MORN', 'REGULAR', 'DOCTOR', '08:00:00', '14:00:00', 15, '#059669'),
          ('Evening Consultation Shift', 'SH-EVE', 'REGULAR', 'DOCTOR', '15:00:00', '21:00:00', 15, '#d97706'),
          ('Day Nursing & Operational', 'SH-STAFF-DAY', 'REGULAR', 'STAFF', '07:00:00', '15:30:00', 15, '#0891b2'),
          ('Night ICU & Emergency Duty', 'SH-NIGHT', 'NIGHT', 'ALL', '21:30:00', '07:30:00', 15, '#7c3aed')
      `);
    }

    // Retroactively fix any records that were checked in but incorrectly marked as ABSENT
    await client.query(`
      UPDATE attendance_records
      SET status = 'PRESENT'
      WHERE check_in_time IS NOT NULL AND status = 'ABSENT'
    `);

    // Retroactively fix admin attendance records that were mistakenly recorded as STAFF
    try {
      await client.query(`
        UPDATE attendance_records
        SET user_type = 'ADMIN'
        WHERE user_type = 'STAFF'
          AND (
            user_id IN (SELECT id FROM user_accounts WHERE lower(role) LIKE '%admin%')
            OR user_id IN (SELECT id FROM users WHERE lower(role::text) LIKE '%admin%')
          )
      `);
    } catch (_e) {}
    try {
      await client.query(`
        UPDATE attendance_records
        SET user_type = 'ADMIN'
        WHERE user_type = 'STAFF'
          AND (
            user_id IN (SELECT id FROM admin_users)
            OR user_id IN (SELECT id FROM master_admin_users)
          )
      `);
    } catch (_e) {}
    try {
      await client.query(`
        UPDATE attendance_records
        SET user_type = 'ADMIN'
        WHERE user_type = 'STAFF'
          AND user_id IN (SELECT id FROM tenant_admin_master_login)
      `);
    } catch (_e) {}

    tablesEnsured = true;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------
// Shift Repository Queries
// ----------------------------------------------------

export async function getAllShifts(tenantId = 'default'): Promise<AttendanceShift[]> {
  await ensureAttendanceTables();
  const query = `
    SELECT * FROM attendance_shifts 
    WHERE tenant_id = $1 
    ORDER BY is_active DESC, start_time ASC
  `;
  const { rows } = await pool.query(query, [tenantId]);
  return rows;
}

export async function getShiftById(shiftId: string): Promise<AttendanceShift | null> {
  await ensureAttendanceTables();
  const query = 'SELECT * FROM attendance_shifts WHERE id = $1';
  const { rows } = await pool.query(query, [shiftId]);
  return rows[0] || null;
}

export async function createShift(data: Partial<AttendanceShift>): Promise<AttendanceShift> {
  await ensureAttendanceTables();
  const query = `
    INSERT INTO attendance_shifts (
      tenant_id, hospital_id, branch_id, name, code, shift_type, applicable_for,
      start_time, end_time, grace_period_minutes, half_day_threshold_hours,
      full_day_threshold_hours, color_code, is_active
    ) VALUES (
      COALESCE($1, 'default'), COALESCE($2, 'default'), $3, $4, $5,
      COALESCE($6, 'REGULAR'), COALESCE($7, 'ALL'), $8, $9,
      COALESCE($10, 15), COALESCE($11, 4.0), COALESCE($12, 8.0),
      COALESCE($13, '#2563eb'), COALESCE($14, true)
    ) RETURNING *
  `;
  const values = [
    data.tenant_id,
    data.hospital_id,
    data.branch_id,
    data.name,
    data.code,
    data.shift_type,
    data.applicable_for,
    data.start_time,
    data.end_time,
    data.grace_period_minutes,
    data.half_day_threshold_hours,
    data.full_day_threshold_hours,
    data.color_code,
    data.is_active,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function updateShift(shiftId: string, data: Partial<AttendanceShift>): Promise<AttendanceShift | null> {
  await ensureAttendanceTables();
  const query = `
    UPDATE attendance_shifts SET
      name = COALESCE($2, name),
      code = COALESCE($3, code),
      shift_type = COALESCE($4, shift_type),
      applicable_for = COALESCE($5, applicable_for),
      start_time = COALESCE($6, start_time),
      end_time = COALESCE($7, end_time),
      grace_period_minutes = COALESCE($8, grace_period_minutes),
      half_day_threshold_hours = COALESCE($9, half_day_threshold_hours),
      full_day_threshold_hours = COALESCE($10, full_day_threshold_hours),
      color_code = COALESCE($11, color_code),
      is_active = COALESCE($12, is_active),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const values = [
    shiftId,
    data.name,
    data.code,
    data.shift_type,
    data.applicable_for,
    data.start_time,
    data.end_time,
    data.grace_period_minutes,
    data.half_day_threshold_hours,
    data.full_day_threshold_hours,
    data.color_code,
    data.is_active,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

// ----------------------------------------------------
// Shift Assignment Queries
// ----------------------------------------------------

export async function getUserProfile(userId: string): Promise<{
  id: string;
  name: string;
  role: string;
  department: string;
  specialization?: string;
  email: string;
  userType: UserType;
} | null> {
  // 1. Try finding directly in doctors table
  try {
    const docRes = await pool.query(
      `SELECT d.id, d.name, d.email, d.specialization, 'DOCTOR' as user_type
       FROM doctors d 
       WHERE d.id::text = $1 OR d.user_account_id::text = $1 
       LIMIT 1`,
      [userId]
    );
    if (docRes.rows[0]) {
      const doc = docRes.rows[0];
      return {
        id: doc.id,
        name: doc.name || 'Doctor',
        role: doc.specialization || 'Doctor',
        department: doc.specialization || 'Clinical',
        specialization: doc.specialization || undefined,
        email: doc.email || '',
        userType: 'DOCTOR',
      };
    }
  } catch (_e) {}

  // 2. Try finding directly in hospital_staff table
  try {
    const staffRes = await pool.query(
      `SELECT hs.id, hs.name, hs.email, hs.role, hs.role as department, 'STAFF' as user_type
       FROM hospital_staff hs 
       WHERE hs.id::text = $1
       LIMIT 1`,
      [userId]
    );
    if (staffRes.rows[0]) {
      const staff = staffRes.rows[0];
      return {
        id: staff.id,
        name: staff.name || 'Staff',
        role: staff.role || 'Staff',
        department: staff.department || staff.role || 'General',
        email: staff.email || '',
        userType: 'STAFF',
      };
    }
  } catch (_e) {}

  // 3. Try admin_users table
  try {
    const auRes = await pool.query(
      `SELECT id, username, role, name, first_name, last_name
       FROM admin_users
       WHERE id::text = $1
       LIMIT 1`,
      [userId]
    );
    if (auRes.rows[0]) {
      const au = auRes.rows[0];
      const fullName = au.name || [au.first_name, au.last_name].filter(Boolean).join(' ') || au.username || 'System Administrator';
      return {
        id: au.id,
        name: fullName,
        role: au.role || 'Admin',
        department: 'Administration',
        email: au.username || '',
        userType: 'ADMIN',
      };
    }
  } catch (_e) {}

  // 4. Try master_admin_users table
  try {
    const mauRes = await pool.query(
      `SELECT id, email, role, name, first_name, last_name
       FROM master_admin_users
       WHERE id::text = $1
       LIMIT 1`,
      [userId]
    );
    if (mauRes.rows[0]) {
      const mau = mauRes.rows[0];
      const fullName = mau.name || [mau.first_name, mau.last_name].filter(Boolean).join(' ') || mau.email || 'Master Administrator';
      return {
        id: mau.id,
        name: fullName,
        role: mau.role || 'Admin',
        department: 'Administration',
        email: mau.email || '',
        userType: 'ADMIN',
      };
    }
  } catch (_e) {}

  // 5. Try user_accounts table
  try {
    const uaRes = await pool.query(
      `SELECT 
        ua.id,
        ua.username as email,
        ua.role as system_role,
        ua.first_name,
        ua.last_name,
        d.id as doc_id,
        d.name as doc_name,
        d.specialization as doc_spec,
        hs.id as staff_id,
        hs.name as staff_name,
        hs.role as staff_role,
        hs.role as staff_dept
      FROM user_accounts ua
      LEFT JOIN hospital_staff hs ON hs.id = ua.id OR hs.email = ua.username
      LEFT JOIN doctors d ON d.id = ua.id OR d.user_account_id = ua.id OR d.email = ua.username
      WHERE ua.id::text = $1
      LIMIT 1`,
      [userId]
    );
    if (uaRes.rows[0]) {
      const row = uaRes.rows[0];
      const roleUpper = (row.system_role || '').toUpperCase();
      const isDoc = Boolean(row.doc_id) || roleUpper.includes('DOCTOR');
      const isAdmin = roleUpper.includes('ADMIN');

      if (isDoc) {
        return {
          id: row.id,
          name: row.doc_name || row.email || 'Doctor',
          role: row.doc_spec || 'Doctor',
          department: row.doc_spec || 'Clinical',
          specialization: row.doc_spec || undefined,
          email: row.email,
          userType: 'DOCTOR',
        };
      }

      if (isAdmin) {
        const adminName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Administrator';
        return {
          id: row.id,
          name: adminName,
          role: row.system_role || 'Admin',
          department: 'Administration',
          email: row.email,
          userType: 'ADMIN',
        };
      }

      return {
        id: row.id,
        name: row.staff_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Staff',
        role: row.staff_role || 'Staff',
        department: row.staff_dept || row.staff_role || 'General',
        email: row.email,
        userType: 'STAFF',
      };
    }
  } catch (_e) {}

  // 6. Try users table
  try {
    const userRes = await pool.query(
      `SELECT 
        u.id,
        u.email,
        u.role as system_role,
        u.full_name,
        d.id as doc_id,
        d.name as doc_name,
        d.specialization as doc_spec,
        hs.id as staff_id,
        hs.name as staff_name,
        hs.role as staff_role,
        hs.role as staff_dept
      FROM users u
      LEFT JOIN hospital_staff hs ON hs.id = u.id OR hs.email = u.email
      LEFT JOIN doctors d ON d.id = u.id OR d.user_account_id = u.id OR d.email = u.email
      WHERE u.id::text = $1
      LIMIT 1`,
      [userId]
    );
    if (userRes.rows[0]) {
      const row = userRes.rows[0];
      const roleUpper = (row.system_role || '').toUpperCase();
      const isDoc = Boolean(row.doc_id) || roleUpper.includes('DOCTOR');
      const isAdmin = roleUpper.includes('ADMIN');

      if (isDoc) {
        return {
          id: row.id,
          name: row.doc_name || row.full_name || row.email || 'Doctor',
          role: row.doc_spec || 'Doctor',
          department: row.doc_spec || 'Clinical',
          specialization: row.doc_spec || undefined,
          email: row.email,
          userType: 'DOCTOR',
        };
      }

      if (isAdmin) {
        return {
          id: row.id,
          name: row.full_name || row.email || 'Administrator',
          role: row.system_role || 'Admin',
          department: 'Administration',
          email: row.email,
          userType: 'ADMIN',
        };
      }

      return {
        id: row.id,
        name: row.staff_name || row.full_name || row.email || 'Staff',
        role: row.staff_role || 'Staff',
        department: row.staff_dept || row.staff_role || 'General',
        email: row.email,
        userType: 'STAFF',
      };
    }
  } catch (_e) {}

  // 7. Try tenant_admin_master_login
  try {
    const tamuRes = await pool.query(
      `SELECT id, username, role FROM tenant_admin_master_login WHERE id::text = $1 LIMIT 1`,
      [userId]
    );
    if (tamuRes.rows[0]) {
      const tamu = tamuRes.rows[0];
      return {
        id: tamu.id,
        name: tamu.username || 'Tenant Administrator',
        role: tamu.role || 'Admin',
        department: 'Administration',
        email: tamu.username || '',
        userType: 'ADMIN',
      };
    }
  } catch (_e) {}

  return null;
}

export async function getUserShiftForDate(
  userId: string,
  dateStr: string,
  userType: UserType = 'STAFF'
): Promise<AttendanceShift | null> {
  await ensureAttendanceTables();
  const dayOfWeek = new Date(dateStr).getDay();

  // 1. Check specific date assignment
  const specificQuery = `
    SELECT s.* FROM user_shift_assignments a
    JOIN attendance_shifts s ON a.shift_id = s.id
    WHERE a.user_id = $1 AND a.specific_date = $2 AND s.is_active = true
    LIMIT 1
  `;
  const { rows: specificRows } = await pool.query(specificQuery, [userId, dateStr]);
  if (specificRows[0]) return specificRows[0];

  // 2. Check recurring day_of_week assignment
  const recurringQuery = `
    SELECT s.* FROM user_shift_assignments a
    JOIN attendance_shifts s ON a.shift_id = s.id
    WHERE a.user_id = $1 
      AND (a.day_of_week = $2 OR a.day_of_week IS NULL)
      AND a.effective_from <= $3
      AND (a.effective_to IS NULL OR a.effective_to >= $3)
      AND s.is_active = true
    ORDER BY a.day_of_week DESC NULLS LAST
    LIMIT 1
  `;
  const { rows: recurringRows } = await pool.query(recurringQuery, [userId, dayOfWeek, dateStr]);
  if (recurringRows[0]) return recurringRows[0];

  // 3. Fallback to default active shift for user type
  const defaultQuery = `
    SELECT * FROM attendance_shifts
    WHERE (applicable_for = 'ALL' OR applicable_for = $1) AND is_active = true
    ORDER BY start_time ASC
    LIMIT 1
  `;
  const { rows: defaultRows } = await pool.query(defaultQuery, [userType]);
  return defaultRows[0] || null;
}

export async function assignUserShift(data: {
  userId: string;
  shiftId: string;
  userType: UserType;
  dayOfWeek?: number | null | undefined;
  specificDate?: string | null | undefined;
  effectiveFrom: string;
  effectiveTo?: string | null | undefined;
  assignedBy?: string | null | undefined;
  tenantId?: string | undefined;
}): Promise<UserShiftAssignment> {
  await ensureAttendanceTables();
  const query = `
    INSERT INTO user_shift_assignments (
      tenant_id, user_id, shift_id, user_type, day_of_week, specific_date,
      effective_from, effective_to, assigned_by
    ) VALUES (
      COALESCE($1, 'default'), $2, $3, $4, $5, $6, $7, $8, $9
    ) RETURNING *
  `;
  const values = [
    data.tenantId,
    data.userId,
    data.shiftId,
    data.userType,
    data.dayOfWeek ?? null,
    data.specificDate ?? null,
    data.effectiveFrom,
    data.effectiveTo ?? null,
    data.assignedBy ?? null,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

// ----------------------------------------------------
// Attendance Records Queries
// ----------------------------------------------------

export async function findAttendanceRecord(
  userId: string,
  dateStr: string,
  tenantId = 'default'
): Promise<AttendanceRecord | null> {
  await ensureAttendanceTables();
  const query = `
    SELECT r.*, s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end
    FROM attendance_records r
    LEFT JOIN attendance_shifts s ON r.shift_id = s.id
    WHERE r.tenant_id = $1 AND r.user_id = $2 AND r.date = $3
  `;
  const { rows } = await pool.query(query, [tenantId, userId, dateStr]);
  return rows[0] || null;
}

export async function getPunchesForRecord(recordId: string): Promise<AttendancePunch[]> {
  await ensureAttendanceTables();
  const query = `
    SELECT * FROM attendance_punches
    WHERE attendance_record_id = $1
    ORDER BY punched_at ASC
  `;
  const { rows } = await pool.query(query, [recordId]);
  return rows;
}

export async function insertPunch(
  recordId: string,
  punchType: PunchType,
  location?: GeoLocationPayload | null,
  ip?: string | null,
  device?: string | null,
  verificationStatus: 'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'FLAGGED' = 'VERIFIED',
  tenantId = 'default',
  punchedAt?: string | Date | null
): Promise<AttendancePunch> {
  await ensureAttendanceTables();
  const query = `
    INSERT INTO attendance_punches (
      tenant_id, attendance_record_id, punch_type, punched_at,
      ip_address, device_info, location, verification_status
    ) VALUES ($1, $2, $3, COALESCE($8::timestamptz, NOW()), $4, $5, $6, $7)
    RETURNING *
  `;
  const values = [
    tenantId,
    recordId,
    punchType,
    ip ?? null,
    device ?? null,
    location ? JSON.stringify(location) : null,
    verificationStatus,
    punchedAt ?? null,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function clearPunchesForRecord(recordId: string): Promise<void> {
  await pool.query('DELETE FROM attendance_punches WHERE attendance_record_id = $1::uuid', [recordId]);
}

export async function upsertAttendanceRecord(
  data: Partial<AttendanceRecord> & { userId: string; date: string }
): Promise<AttendanceRecord> {
  await ensureAttendanceTables();

  const effectiveStatus = data.status || (data.check_in_time ? 'PRESENT' : 'ABSENT');

  const query = `
    INSERT INTO attendance_records (
      tenant_id, hospital_id, branch_id, user_id, user_type, date, shift_id,
      check_in_time, check_out_time, total_working_minutes, total_break_minutes,
      overtime_minutes, status, check_in_method, check_in_ip, check_in_device,
      check_in_location, check_out_location, is_manual_entry, manual_reason,
      approved_by, remarks
    ) VALUES (
      COALESCE($1, 'default'), COALESCE($2, 'default'), $3, $4::uuid, COALESCE($5, 'STAFF'),
      $6::date, $7::uuid, $8::timestamptz, $9::timestamptz, COALESCE($10, 0), COALESCE($11, 0), COALESCE($12, 0),
      COALESCE($13, 'PRESENT'), COALESCE($14, 'WEB_PORTAL'), $15, $16,
      $17::jsonb, $18::jsonb, COALESCE($19, false), $20, $21::uuid, $22
    )
    ON CONFLICT (tenant_id, user_id, date) DO UPDATE SET
      user_type = COALESCE(EXCLUDED.user_type, attendance_records.user_type),
      shift_id = COALESCE(EXCLUDED.shift_id, attendance_records.shift_id),
      check_in_time = COALESCE(EXCLUDED.check_in_time, attendance_records.check_in_time),
      check_out_time = COALESCE(EXCLUDED.check_out_time, attendance_records.check_out_time),
      total_working_minutes = COALESCE(EXCLUDED.total_working_minutes, attendance_records.total_working_minutes),
      total_break_minutes = COALESCE(EXCLUDED.total_break_minutes, attendance_records.total_break_minutes),
      overtime_minutes = COALESCE(EXCLUDED.overtime_minutes, attendance_records.overtime_minutes),
      status = CASE 
        WHEN attendance_records.status = 'PRESENT' THEN 'PRESENT'
        WHEN EXCLUDED.status = 'ABSENT' AND (EXCLUDED.check_in_time IS NOT NULL OR attendance_records.check_in_time IS NOT NULL) 
          THEN COALESCE(NULLIF(attendance_records.status, 'ABSENT'), 'PRESENT')
        ELSE COALESCE(EXCLUDED.status, attendance_records.status)
      END,
      check_in_method = COALESCE(EXCLUDED.check_in_method, attendance_records.check_in_method),
      check_out_location = COALESCE(EXCLUDED.check_out_location, attendance_records.check_out_location),
      is_manual_entry = COALESCE(EXCLUDED.is_manual_entry, attendance_records.is_manual_entry),
      manual_reason = COALESCE(EXCLUDED.manual_reason, attendance_records.manual_reason),
      approved_by = COALESCE(EXCLUDED.approved_by, attendance_records.approved_by),
      remarks = COALESCE(EXCLUDED.remarks, attendance_records.remarks),
      updated_at = NOW()
    RETURNING *
  `;

  const values = [
    data.tenant_id || 'default',
    data.hospital_id || 'default',
    data.branch_id || null,
    data.userId,
    data.user_type ?? null,
    data.date,
    data.shift_id || null,
    data.check_in_time || null,
    data.check_out_time || null,
    data.total_working_minutes ?? 0,
    data.total_break_minutes ?? 0,
    data.overtime_minutes ?? 0,
    effectiveStatus,
    data.check_in_method || 'WEB_PORTAL',
    data.check_in_ip || null,
    data.check_in_device || null,
    data.check_in_location ? JSON.stringify(data.check_in_location) : null,
    data.check_out_location ? JSON.stringify(data.check_out_location) : null,
    data.is_manual_entry ?? false,
    data.manual_reason || null,
    data.approved_by || null,
    data.remarks || null,
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function getUserAttendanceHistory(
  userId: string,
  startDate: string,
  endDate: string,
  tenantId = 'default'
): Promise<AttendanceRecord[]> {
  await ensureAttendanceTables();
  const query = `
    SELECT r.*, s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.color_code
    FROM attendance_records r
    LEFT JOIN attendance_shifts s ON r.shift_id = s.id
    WHERE r.tenant_id = $1 AND r.user_id = $2 AND r.date >= $3 AND r.date <= $4
    ORDER BY r.date DESC
  `;
  const { rows } = await pool.query(query, [tenantId, userId, startDate, endDate]);
  return rows;
}

// ----------------------------------------------------
// Admin Attendance Dashboard & Records Queries
// ----------------------------------------------------

export async function getAdminDashboardStats(
  dateStr: string,
  tenantId = 'default'
): Promise<AttendanceDashboardSummary> {
  await ensureAttendanceTables();

  // 1. Total counts of Doctors and Staff
  let totalDoctors = 0;
  try {
    const docRes = await pool.query(
      "SELECT COUNT(*) FROM doctors WHERE status = 'ACTIVE' OR status IS NULL"
    );
    totalDoctors = parseInt(docRes.rows[0]?.count || '0', 10);
    if (totalDoctors === 0) {
      const userDocRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'doctor'");
      totalDoctors = parseInt(userDocRes.rows[0]?.count || '0', 10);
    }
  } catch {
    try {
      const userDocRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'doctor'");
      totalDoctors = parseInt(userDocRes.rows[0]?.count || '0', 10);
    } catch {
      totalDoctors = 0;
    }
  }

  const totalStaffRes = await pool.query(
    "SELECT COUNT(*) FROM hospital_staff WHERE status = 'ACTIVE' OR status IS NULL"
  );
  const totalStaff = parseInt(totalStaffRes.rows[0]?.count || '0', 10);

  // 2. Active status metrics for specified date
  const statusCountsRes = await pool.query(
    `
    SELECT 
      user_type,
      status,
      COUNT(*) as count
    FROM attendance_records
    WHERE tenant_id = $1 AND date = $2
    GROUP BY user_type, status
  `,
    [tenantId, dateStr]
  );

  let activeDoctors = 0;
  let activeStaff = 0;
  let lateToday = 0;
  let absentToday = 0;
  let onLeaveToday = 0;

  for (const row of statusCountsRes.rows) {
    const count = parseInt(row.count, 10);
    if (row.user_type === 'DOCTOR' && (row.status === 'PRESENT' || row.status === 'LATE' || row.status === 'HALF_DAY')) {
      activeDoctors += count;
    }
    if (row.user_type === 'STAFF' && (row.status === 'PRESENT' || row.status === 'LATE' || row.status === 'HALF_DAY')) {
      activeStaff += count;
    }
    if (row.status === 'LATE') lateToday += count;
    if (row.status === 'ABSENT') absentToday += count;
    if (row.status === 'ON_LEAVE') onLeaveToday += count;
  }

  // 3. Department presence breakdown
  const deptRes = await pool.query(`
    WITH all_members AS (
      SELECT s.id, COALESCE(s.role, 'General') as department, s.email
      FROM hospital_staff s
      WHERE s.status = 'ACTIVE' OR s.status IS NULL
      UNION ALL
      SELECT d.id, COALESCE(d.specialization, 'Clinical') as department, d.email
      FROM doctors d
      WHERE d.status = 'ACTIVE' OR d.is_active = true OR d.status IS NULL
      UNION ALL
      SELECT ua.id, 'Administration' as department, ua.username as email
      FROM user_accounts ua
      WHERE lower(ua.role) LIKE '%admin%'
      UNION ALL
      SELECT au.id, 'Administration' as department, au.username as email
      FROM admin_users au
      WHERE au.status = 'ACTIVE' OR au.status IS NULL
    )
    SELECT 
      m.department,
      COUNT(DISTINCT m.id) as total,
      COUNT(DISTINCT CASE WHEN a.status IN ('PRESENT', 'LATE', 'HALF_DAY') THEN m.id END) as present
    FROM all_members m
    LEFT JOIN users u ON u.email = m.email
    LEFT JOIN attendance_records a ON (a.user_id = m.id OR a.user_id = u.id) AND a.date = $1
    GROUP BY m.department
  `, [dateStr]);

  const departmentBreakdown = deptRes.rows.map((r) => {
    const total = parseInt(r.total, 10);
    const present = parseInt(r.present, 10);
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return {
      department: r.department,
      total,
      present,
      percentage,
    };
  });

  // 4. Recent live punches
  const recentPunchesRes = await pool.query(`
    SELECT 
      p.punch_type,
      p.punched_at,
      r.user_type,
      r.status,
      COALESCE(
        CASE WHEN r.user_type = 'DOCTOR' AND d.name NOT LIKE 'Dr.%' THEN 'Dr. ' || d.name ELSE d.name END,
        hs.name,
        NULLIF(TRIM(COALESCE(au.name, CONCAT_WS(' ', au.first_name, au.last_name))), ''),
        NULLIF(TRIM(COALESCE(mau.name, CONCAT_WS(' ', mau.first_name, mau.last_name))), ''),
        NULLIF(TRIM(CONCAT_WS(' ', ua.first_name, ua.last_name)), ''),
        u.full_name,
        au.username,
        mau.email,
        ua.username,
        'Hospital User'
      ) as user_name,
      COALESCE(
        CASE 
          WHEN r.user_type = 'DOCTOR' THEN COALESCE(d.specialization, 'Doctor')
          WHEN r.user_type = 'ADMIN' THEN COALESCE(au.role, mau.role, ua.role, 'Admin')
          ELSE hs.role
        END,
        au.role, mau.role, ua.role, hs.role, 'Staff'
      ) as role,
      COALESCE(sh.name, 'General Shift') as shift_name,
      r.user_id
    FROM attendance_punches p
    JOIN attendance_records r ON p.attendance_record_id = r.id
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN user_accounts ua ON r.user_id = ua.id
    LEFT JOIN admin_users au ON r.user_id = au.id
    LEFT JOIN master_admin_users mau ON r.user_id = mau.id
    LEFT JOIN hospital_staff hs ON hs.id = r.user_id OR hs.email = u.email OR hs.email = ua.username
    LEFT JOIN doctors d ON d.id = r.user_id OR d.user_account_id = r.user_id OR d.email = u.email OR d.email = ua.username
    LEFT JOIN attendance_shifts sh ON r.shift_id = sh.id
    WHERE r.date = $1
    ORDER BY p.punched_at DESC
    LIMIT 8
  `, [dateStr]);

  const recentPunches = recentPunchesRes.rows.map((r) => ({
    user_id: r.user_id,
    user_name: r.user_name,
    user_type: r.user_type as UserType,
    role: r.role,
    punch_type: r.punch_type as PunchType,
    punched_at: r.punched_at,
    shift_name: r.shift_name,
    status: r.status as AttendanceStatus,
  }));

  return {
    date: dateStr,
    total_doctors: totalDoctors,
    active_doctors_on_duty: activeDoctors,
    total_staff: totalStaff,
    active_staff_on_duty: activeStaff,
    late_arrivals_today: lateToday,
    absent_today: absentToday,
    on_leave_today: onLeaveToday,
    department_breakdown: departmentBreakdown,
    recent_punches: recentPunches,
  };
}

export async function getAdminAttendanceRecords(
  filters: AttendanceFilterParams,
  tenantId = 'default'
): Promise<{ records: AttendanceRecord[]; total: number }> {
  await ensureAttendanceTables();

  const whereClauses: string[] = ['r.tenant_id = $1'];
  const values: any[] = [tenantId];
  let paramIdx = 2;

  if (filters.date) {
    whereClauses.push(`r.date = $${paramIdx++}`);
    values.push(filters.date);
  } else if (filters.startDate && filters.endDate) {
    whereClauses.push(`r.date >= $${paramIdx++} AND r.date <= $${paramIdx++}`);
    values.push(filters.startDate, filters.endDate);
  }

  if (filters.userType && filters.userType !== 'ALL') {
    whereClauses.push(`r.user_type = $${paramIdx++}`);
    values.push(filters.userType);
  }

  if (filters.status && filters.status !== 'ALL') {
    whereClauses.push(`r.status = $${paramIdx++}`);
    values.push(filters.status);
  }

  if (filters.shiftId) {
    whereClauses.push(`r.shift_id = $${paramIdx++}`);
    values.push(filters.shiftId);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(COALESCE(d.name, hs.name, au.name, mau.name, u.full_name, ua.username, au.username, mau.email, '')) LIKE $${paramIdx} OR 
      LOWER(COALESCE(d.email, hs.email, au.username, mau.email, u.email, ua.username, '')) LIKE $${paramIdx}
    )`);
    values.push(term);
    paramIdx++;
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total matching
  const countQuery = `
    SELECT COUNT(*) FROM attendance_records r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN user_accounts ua ON r.user_id = ua.id
    LEFT JOIN admin_users au ON r.user_id = au.id
    LEFT JOIN master_admin_users mau ON r.user_id = mau.id
    LEFT JOIN tenant_admin_master_login tamu ON r.user_id = tamu.id
    LEFT JOIN hospital_staff hs ON hs.id = r.user_id OR hs.email = u.email OR hs.email = ua.username
    LEFT JOIN doctors d ON d.id = r.user_id OR d.user_account_id = r.user_id OR d.email = u.email OR d.email = ua.username
    ${whereStr}
  `;
  const countRes = await pool.query(countQuery, values);
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  // Paginated query
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  const dataQuery = `
    SELECT 
      r.*,
      COALESCE(
        CASE WHEN r.user_type = 'DOCTOR' AND d.name NOT LIKE 'Dr.%' THEN 'Dr. ' || d.name ELSE d.name END,
        hs.name,
        NULLIF(TRIM(COALESCE(au.name, CONCAT_WS(' ', au.first_name, au.last_name))), ''),
        NULLIF(TRIM(COALESCE(mau.name, CONCAT_WS(' ', mau.first_name, mau.last_name))), ''),
        NULLIF(TRIM(CONCAT_WS(' ', ua.first_name, ua.last_name)), ''),
        u.full_name,
        au.username,
        mau.email,
        ua.username,
        tamu.username,
        u.email,
        CASE WHEN r.user_type = 'ADMIN' THEN 'Administrator' ELSE 'Hospital User' END
      ) as user_name,
      COALESCE(
        CASE 
          WHEN r.user_type = 'DOCTOR' THEN COALESCE(d.specialization, 'Doctor')
          WHEN r.user_type = 'ADMIN' THEN COALESCE(au.role, mau.role, ua.role, tamu.role, u.role::text, 'Admin')
          ELSE hs.role
        END,
        CASE WHEN r.user_type = 'ADMIN' THEN 'Admin' ELSE NULL END,
        au.role,
        mau.role,
        ua.role,
        tamu.role,
        hs.role,
        u.role::text,
        'Staff'
      ) as user_role,
      COALESCE(
        CASE WHEN r.user_type = 'ADMIN' THEN 'Administration' ELSE NULL END,
        d.specialization,
        hs.role,
        'General'
      ) as department,
      s.name as shift_name,
      s.start_time as shift_start,
      s.end_time as shift_end,
      s.color_code as shift_color,
      COALESCE(appr.full_name, apprua.username, apprau.name, apprau.username, 'Administrator') as approved_by_name
    FROM attendance_records r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN user_accounts ua ON r.user_id = ua.id
    LEFT JOIN admin_users au ON r.user_id = au.id
    LEFT JOIN master_admin_users mau ON r.user_id = mau.id
    LEFT JOIN tenant_admin_master_login tamu ON r.user_id = tamu.id
    LEFT JOIN hospital_staff hs ON hs.id = r.user_id OR hs.email = u.email OR hs.email = ua.username
    LEFT JOIN doctors d ON d.id = r.user_id OR d.user_account_id = r.user_id OR d.email = u.email OR d.email = ua.username
    LEFT JOIN attendance_shifts s ON r.shift_id = s.id
    LEFT JOIN users appr ON r.approved_by = appr.id
    LEFT JOIN user_accounts apprua ON r.approved_by = apprua.id
    LEFT JOIN admin_users apprau ON r.approved_by = apprau.id
    ${whereStr}
    ORDER BY r.date DESC, r.check_in_time DESC NULLS LAST
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  values.push(limit, offset);

  const { rows } = await pool.query(dataQuery, values);

  const recordIds = rows.map((r) => r.id);
  const punchesByRecordId: Record<string, AttendancePunch[]> = {};
  if (recordIds.length > 0) {
    try {
      const { rows: punchRows } = await pool.query(
        `SELECT * FROM attendance_punches WHERE attendance_record_id = ANY($1::uuid[]) ORDER BY punched_at ASC`,
        [recordIds]
      );
      for (const p of punchRows) {
        const recId = p.attendance_record_id;
        if (!punchesByRecordId[recId]) {
          punchesByRecordId[recId] = [];
        }
        const arr = punchesByRecordId[recId];
        if (arr) {
          arr.push({
            id: p.id,
            tenant_id: p.tenant_id,
            attendance_record_id: p.attendance_record_id,
            punch_type: p.punch_type,
            punched_at: p.punched_at instanceof Date ? p.punched_at.toISOString() : p.punched_at,
            ip_address: p.ip_address,
            device_info: p.device_info,
            location: p.location,
            verification_status: p.verification_status,
            created_at: p.created_at,
          });
        }
      }
    } catch (_e) {}
  }

  const records: AttendanceRecord[] = rows.map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    hospital_id: r.hospital_id,
    branch_id: r.branch_id,
    user_id: r.user_id,
    user_type: r.user_type,
    user_name: r.user_name,
    user_role: r.user_role,
    department: r.department,
    date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
    shift_id: r.shift_id,
    shift: r.shift_id
      ? {
          id: r.shift_id,
          name: r.shift_name,
          start_time: r.shift_start,
          end_time: r.shift_end,
          color_code: r.shift_color,
        } as any
      : null,
    check_in_time: r.check_in_time,
    check_out_time: r.check_out_time,
    total_working_minutes: r.total_working_minutes,
    total_break_minutes: r.total_break_minutes,
    overtime_minutes: r.overtime_minutes,
    status: r.status,
    check_in_method: r.check_in_method,
    check_in_ip: r.check_in_ip,
    check_in_device: r.check_in_device,
    check_in_location: r.check_in_location,
    check_out_location: r.check_out_location,
    is_manual_entry: r.is_manual_entry,
    manual_reason: r.manual_reason,
    approved_by: r.approved_by,
    approved_by_name: r.approved_by_name,
    remarks: r.remarks,
    punches: punchesByRecordId[r.id] || [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return { records, total };
}

export async function deleteAttendanceRecord(recordId: string, tenantId = 'default'): Promise<boolean> {
  await ensureAttendanceTables();
  await pool.query('DELETE FROM attendance_punches WHERE attendance_record_id = $1::uuid', [recordId]);
  const res = await pool.query('DELETE FROM attendance_records WHERE id = $1::uuid AND tenant_id = $2', [recordId, tenantId]);
  return (res.rowCount ?? 0) > 0;
}

// ----------------------------------------------------
// Regularization Requests Queries
// ----------------------------------------------------

export async function createRegularizationRequest(data: {
  userId: string;
  recordId?: string | null | undefined;
  date: string;
  requestType: RegularizationType;
  requestedCheckIn?: string | null | undefined;
  requestedCheckOut?: string | null | undefined;
  reason: string;
  tenantId?: string | undefined;
}): Promise<AttendanceRegularization> {
  await ensureAttendanceTables();
  const query = `
    INSERT INTO attendance_regularizations (
      tenant_id, user_id, attendance_record_id, date, request_type,
      requested_check_in, requested_check_out, reason, status
    ) VALUES (
      COALESCE($1, 'default'), $2, $3, $4, $5, $6, $7, $8, 'PENDING'
    ) RETURNING *
  `;
  const values = [
    data.tenantId,
    data.userId,
    data.recordId ?? null,
    data.date,
    data.requestType,
    data.requestedCheckIn ?? null,
    data.requestedCheckOut ?? null,
    data.reason,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function getUserRegularizations(
  userId: string,
  tenantId = 'default'
): Promise<AttendanceRegularization[]> {
  await ensureAttendanceTables();
  const query = `
    SELECT reg.*, COALESCE(rev.full_name, 'Administrator') as reviewed_by_name
    FROM attendance_regularizations reg
    LEFT JOIN users rev ON reg.reviewed_by = rev.id
    WHERE reg.tenant_id = $1 AND reg.user_id = $2
    ORDER BY reg.created_at DESC
  `;
  const { rows } = await pool.query(query, [tenantId, userId]);
  return rows;
}

export async function getAllRegularizations(
  statusFilter?: RegularizationStatus | 'ALL',
  tenantId = 'default'
): Promise<AttendanceRegularization[]> {
  await ensureAttendanceTables();
  const whereClauses: string[] = ['reg.tenant_id = $1'];
  const values: any[] = [tenantId];

  if (statusFilter && statusFilter !== 'ALL') {
    whereClauses.push('reg.status = $2');
    values.push(statusFilter);
  }

  const query = `
    SELECT 
      reg.*,
      COALESCE(d.name, hs.name, u.full_name, 'Employee') as user_name,
      COALESCE(d.specialization, hs.role, u.role::text, 'Staff') as user_role,
      COALESCE(rev.full_name, 'Administrator') as reviewed_by_name
    FROM attendance_regularizations reg
    LEFT JOIN users u ON reg.user_id = u.id
    LEFT JOIN hospital_staff hs ON hs.id = reg.user_id OR hs.email = u.email
    LEFT JOIN doctors d ON d.id = reg.user_id OR d.user_account_id = reg.user_id OR d.email = u.email
    LEFT JOIN users rev ON reg.reviewed_by = rev.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY reg.created_at DESC
  `;
  const { rows } = await pool.query(query, values);
  return rows;
}

export async function updateRegularizationStatus(
  id: string,
  status: RegularizationStatus,
  reviewerId: string,
  rejectionReason?: string
): Promise<AttendanceRegularization | null> {
  await ensureAttendanceTables();
  const query = `
    UPDATE attendance_regularizations SET
      status = $2,
      reviewed_by = $3,
      reviewed_at = NOW(),
      rejection_reason = $4,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await pool.query(query, [id, status, reviewerId, rejectionReason ?? null]);
  return rows[0] || null;
}
