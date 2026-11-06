import { pool } from '@/db/pool.js';
import type {
  CreateStaffInput,
  StaffDocument,
  StaffFilterParams,
  StaffMember,
  StaffStatus,
  UpdateStaffInput,
} from './staff.types.js';

let tableEnsured = false;

export async function ensureStaffTable(): Promise<void> {
  if (tableEnsured) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hospital_staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_code VARCHAR(50) UNIQUE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        address TEXT,
        role VARCHAR(100) NOT NULL,
        hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
        branch_id UUID REFERENCES hospital_branches(id) ON DELETE SET NULL,
        shift_timing VARCHAR(100) NOT NULL DEFAULT 'Morning',
        custom_shift_details VARCHAR(255),
        joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        notes TEXT,
        documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_hospital_staff_hospital ON hospital_staff(hospital_id);
      CREATE INDEX IF NOT EXISTS idx_hospital_staff_branch ON hospital_staff(branch_id);
      CREATE INDEX IF NOT EXISTS idx_hospital_staff_role ON hospital_staff(role);
      CREATE INDEX IF NOT EXISTS idx_hospital_staff_status ON hospital_staff(status);
    `);
    tableEnsured = true;
  } catch (err) {
    console.error('Failed to ensure hospital_staff table:', err);
  } finally {
    client.release();
  }
}

function mapRowToStaffMember(row: any): StaffMember {
  let docs: StaffDocument[] = [];
  if (Array.isArray(row.documents)) {
    docs = row.documents;
  } else if (typeof row.documents === 'string') {
    try {
      docs = JSON.parse(row.documents);
    } catch {
      docs = [];
    }
  }

  const staff: StaffMember = {
    id: row.id,
    staffCode: row.staff_code || '',
    name: row.name,
    phone: row.phone,
    role: row.role,
    shiftTiming: row.shift_timing || 'Morning',
    joiningDate: row.joining_date ? String(row.joining_date).split('T')[0]! : '',
    status: row.status as StaffStatus,
    documents: docs,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  if (row.email) staff.email = row.email;
  if (row.address) staff.address = row.address;
  if (row.hospital_id) staff.hospitalId = row.hospital_id;
  if (row.hospital_name) staff.hospitalName = row.hospital_name;
  if (row.branch_id) staff.branchId = row.branch_id;
  if (row.branch_name) staff.branchName = row.branch_name;
  if (row.custom_shift_details) staff.customShiftDetails = row.custom_shift_details;
  if (row.notes) staff.notes = row.notes;

  return staff;
}

export async function generateStaffCode(): Promise<string> {
  await ensureStaffTable();
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM hospital_staff`
  );
  const count = parseInt(res.rows[0]?.count || '0', 10) + 1;
  const numStr = String(count).padStart(3, '0');
  const code = `STF-${numStr}`;

  // Double check uniqueness
  const exists = await pool.query(`SELECT 1 FROM hospital_staff WHERE staff_code = $1`, [code]);
  if (exists.rows.length > 0) {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `STF-${randomSuffix}`;
  }
  return code;
}

export async function getAllStaff(filters?: StaffFilterParams): Promise<StaffMember[]> {
  await ensureStaffTable();

  const conditions: string[] = [];
  const values: any[] = [];

  if (filters?.status && filters.status !== 'ALL') {
    values.push(filters.status);
    conditions.push(`s.status = $${values.length}`);
  }

  if (filters?.role && filters.role !== 'all') {
    values.push(filters.role);
    conditions.push(`s.role = $${values.length}`);
  }

  if (filters?.hospitalId && filters.hospitalId !== 'all') {
    values.push(filters.hospitalId);
    conditions.push(`s.hospital_id = $${values.length}`);
  }

  if (filters?.branchId && filters.branchId !== 'all') {
    values.push(filters.branchId);
    conditions.push(`s.branch_id = $${values.length}`);
  }

  if (filters?.shiftTiming && filters.shiftTiming !== 'all') {
    values.push(filters.shiftTiming);
    conditions.push(`s.shift_timing = $${values.length}`);
  }

  if (filters?.search && filters.search.trim()) {
    values.push(`%${filters.search.trim()}%`);
    const pIndex = values.length;
    conditions.push(
      `(s.name ILIKE $${pIndex} OR s.phone ILIKE $${pIndex} OR s.email ILIKE $${pIndex} OR s.staff_code ILIKE $${pIndex} OR s.role ILIKE $${pIndex} OR h.name ILIKE $${pIndex} OR b.name ILIKE $${pIndex})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      s.*,
      h.name AS hospital_name,
      b.name AS branch_name
    FROM hospital_staff s
    LEFT JOIN hospitals h ON s.hospital_id = h.id
    LEFT JOIN hospital_branches b ON s.branch_id = b.id
    ${whereClause}
    ORDER BY s.created_at DESC
  `;

  const { rows } = await pool.query(query, values);
  return rows.map(mapRowToStaffMember);
}

export async function getStaffById(id: string): Promise<StaffMember | null> {
  await ensureStaffTable();

  const query = `
    SELECT 
      s.*,
      h.name AS hospital_name,
      b.name AS branch_name
    FROM hospital_staff s
    LEFT JOIN hospitals h ON s.hospital_id = h.id
    LEFT JOIN hospital_branches b ON s.branch_id = b.id
    WHERE s.id = $1
  `;

  const { rows } = await pool.query(query, [id]);
  if (rows.length === 0) return null;
  return mapRowToStaffMember(rows[0]);
}

export async function createStaff(input: CreateStaffInput): Promise<StaffMember> {
  await ensureStaffTable();

  const staffCode = await generateStaffCode();
  const hospitalId = input.hospitalId || input.hospital_id || null;
  const branchId = input.branchId || input.branch_id || null;
  const shiftTiming = input.shiftTiming || input.shift_timing || 'Morning';
  const customShiftDetails = input.customShiftDetails || input.custom_shift_details || null;
  const joiningDate = input.joiningDate || input.joining_date || new Date().toISOString().split('T')[0];
  const status = input.status || 'ACTIVE';

  const insertSql = `
    INSERT INTO hospital_staff (
      staff_code,
      name,
      phone,
      email,
      address,
      role,
      hospital_id,
      branch_id,
      shift_timing,
      custom_shift_details,
      joining_date,
      status,
      notes,
      documents,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, '[]'::jsonb, NOW(), NOW()
    ) RETURNING *
  `;

  const { rows } = await pool.query(insertSql, [
    staffCode,
    input.name.trim(),
    input.phone.trim(),
    input.email?.trim() || null,
    input.address?.trim() || null,
    input.role.trim(),
    hospitalId,
    branchId,
    shiftTiming,
    customShiftDetails,
    joiningDate,
    status,
    input.notes?.trim() || null,
  ]);

  return (await getStaffById(rows[0].id))!;
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<StaffMember | null> {
  await ensureStaffTable();

  const updates: string[] = [];
  const values: any[] = [id];

  if (input.name !== undefined) {
    values.push(input.name.trim());
    updates.push(`name = $${values.length}`);
  }
  if (input.phone !== undefined) {
    values.push(input.phone.trim());
    updates.push(`phone = $${values.length}`);
  }
  if (input.email !== undefined) {
    values.push(input.email?.trim() || null);
    updates.push(`email = $${values.length}`);
  }
  if (input.address !== undefined) {
    values.push(input.address?.trim() || null);
    updates.push(`address = $${values.length}`);
  }
  if (input.role !== undefined) {
    values.push(input.role.trim());
    updates.push(`role = $${values.length}`);
  }
  const effectiveHospitalId = input.hospitalId ?? input.hospital_id;
  if (effectiveHospitalId !== undefined) {
    values.push(effectiveHospitalId || null);
    updates.push(`hospital_id = $${values.length}`);
  }
  const effectiveBranchId = input.branchId ?? input.branch_id;
  if (effectiveBranchId !== undefined) {
    values.push(effectiveBranchId || null);
    updates.push(`branch_id = $${values.length}`);
  }
  const effectiveShiftTiming = input.shiftTiming ?? input.shift_timing;
  if (effectiveShiftTiming !== undefined) {
    values.push(effectiveShiftTiming);
    updates.push(`shift_timing = $${values.length}`);
  }
  const effectiveCustomShift = input.customShiftDetails ?? input.custom_shift_details;
  if (effectiveCustomShift !== undefined) {
    values.push(effectiveCustomShift || null);
    updates.push(`custom_shift_details = $${values.length}`);
  }
  const effectiveJoiningDate = input.joiningDate ?? input.joining_date;
  if (effectiveJoiningDate !== undefined) {
    values.push(effectiveJoiningDate);
    updates.push(`joining_date = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    updates.push(`status = $${values.length}`);
  }
  if (input.notes !== undefined) {
    values.push(input.notes?.trim() || null);
    updates.push(`notes = $${values.length}`);
  }

  if (updates.length === 0) {
    return getStaffById(id);
  }

  updates.push(`updated_at = NOW()`);

  const updateSql = `
    UPDATE hospital_staff
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id
  `;

  const { rows } = await pool.query(updateSql, values);
  if (rows.length === 0) return null;
  return getStaffById(id);
}

export async function updateStaffStatus(id: string, status: StaffStatus): Promise<StaffMember | null> {
  await ensureStaffTable();

  const { rows } = await pool.query(
    `UPDATE hospital_staff SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id, status]
  );
  if (rows.length === 0) return null;
  return getStaffById(id);
}

export async function addStaffDocument(staffId: string, doc: StaffDocument): Promise<StaffMember | null> {
  await ensureStaffTable();

  const { rows } = await pool.query(
    `UPDATE hospital_staff 
     SET documents = documents || $2::jsonb, updated_at = NOW() 
     WHERE id = $1 
     RETURNING id`,
    [staffId, JSON.stringify([doc])]
  );
  if (rows.length === 0) return null;
  return getStaffById(staffId);
}

export async function removeStaffDocument(staffId: string, docId: string): Promise<StaffMember | null> {
  await ensureStaffTable();

  const { rows } = await pool.query(
    `UPDATE hospital_staff 
     SET documents = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
       FROM jsonb_array_elements(documents) elem
       WHERE elem->>'id' <> $2
     ),
     updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [staffId, docId]
  );
  if (rows.length === 0) return null;
  return getStaffById(staffId);
}

export async function deleteStaff(id: string): Promise<boolean> {
  await ensureStaffTable();

  const { rowCount } = await pool.query(`DELETE FROM hospital_staff WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

