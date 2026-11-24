import { pool } from '@/db/pool.js';
import { s3Service } from '@/modules/s3/s3.service.js';

async function signProfileUrl(url?: string | null): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.includes('amazonaws.com') && !trimmed.includes('X-Amz-Signature')) {
    try {
      const parts = trimmed.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          return await s3Service.getReadUrl(decodeURIComponent(key), 86400);
        }
      }
    } catch {
      return trimmed;
    }
  }
  if (trimmed.includes('share.google') || trimmed.includes('drive.google.com')) {
    return `/api/patients/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export interface CreatePatientInput {
  patient_id?: string | null | undefined;
  user_account_id?: string | null | undefined;
  hospital_id: string;
  branch_id?: string | null | undefined;
  name: string;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  date_of_birth?: string | null | undefined;
  gender?: string | null | undefined;
  occupation?: string | null | undefined;
  address?: string | null | undefined;
  address_line_1?: string | null | undefined;
  address_line_2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  pincode?: string | null | undefined;
  status: 'ACTIVE' | 'INACTIVE';
  height_cm?: number | null | undefined;
  weight_kg?: number | null | undefined;
  blood_group?: string | null | undefined;
  blood_pressure?: string | null | undefined;
  blood_sugar?: string | null | undefined;
  body_temperature?: string | null | undefined;
  custom_vitals?: any;
  marital_status?: string | null | undefined;
  emergency_contacts?: any;
  profile_image_url?: string | null | undefined;
  is_active?: boolean | null | undefined;
  referred_by?: string | null | undefined;
  referral_id?: string | null | undefined;
  referral_doctor_id?: string | null | undefined;
  alliance_doctor_id?: string | null | undefined;
}

export interface UpdatePatientInput extends CreatePatientInput {
  id: string;
}

let patientColumnsEnsured = false;
async function ensurePatientColumns(client: any): Promise<void> {
  if (patientColumnsEnsured) return;
  try {
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 1;

      ALTER TABLE patients 
        ADD COLUMN IF NOT EXISTS patient_id VARCHAR(50),
        ADD COLUMN IF NOT EXISTS occupation VARCHAR(150),
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
        ADD COLUMN IF NOT EXISTS blood_pressure VARCHAR(50),
        ADD COLUMN IF NOT EXISTS blood_sugar VARCHAR(50),
        ADD COLUMN IF NOT EXISTS body_temperature VARCHAR(50),
        ADD COLUMN IF NOT EXISTS custom_vitals JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50),
        ADD COLUMN IF NOT EXISTS referral_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS referral_doctor_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS alliance_doctor_id VARCHAR(100);

      DO $$
      DECLARE
        rec RECORD;
        cnt INT := 0;
      BEGIN
        SELECT COALESCE(MAX(SUBSTRING(patient_id FROM 4)::INTEGER), 0) INTO cnt 
        FROM patients 
        WHERE patient_id ~ '^PA_[0-9]+$';

        FOR rec IN SELECT id FROM patients WHERE patient_id IS NULL ORDER BY created_at ASC, id ASC LOOP
          cnt := cnt + 1;
          UPDATE patients SET patient_id = 'PA_' || LPAD(cnt::TEXT, 3, '0') WHERE id = rec.id;
        END LOOP;

        IF cnt > 0 THEN
          PERFORM setval('patient_id_seq', cnt, true);
        END IF;
      END $$;

      ALTER TABLE patients
        ALTER COLUMN patient_id SET DEFAULT ('PA_' || LPAD(nextval('patient_id_seq')::TEXT, 3, '0'));

      CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
    `);
    patientColumnsEnsured = true;
  } catch (err) {
    console.error('Failed to ensure patient address, vitals, and patient_id columns:', err);
  }
}

export class PatientsService {
  async getAllPatients(search?: string) {
    const client = await pool.connect();
    try {
      await ensurePatientColumns(client);
      let query = `
        SELECT p.*, 
               h.name as hospital_name, 
               b.name as branch_name 
        FROM patients p
        LEFT JOIN hospitals h ON p.hospital_id = h.id
        LEFT JOIN hospital_branches b ON p.branch_id = b.id
      `;
      const params: any[] = [];
      if (search && search.trim()) {
        params.push(`%${search.trim()}%`);
        query += ` WHERE (p.name ILIKE $1 OR p.phone ILIKE $1 OR p.email ILIKE $1 OR p.patient_id ILIKE $1) `;
      }
      query += ` ORDER BY p.created_at DESC `;
      const { rows } = await client.query(query, params);

      for (const row of rows) {
        if (row.profile_image_url) {
          row.profile_image_url = await signProfileUrl(row.profile_image_url);
        }
      }

      return rows;
    } finally {
      client.release();
    }
  }

  async getPatientById(id: string) {
    const client = await pool.connect();
    try {
      await ensurePatientColumns(client);
      const { rows } = await client.query(
        `SELECT p.*, 
               h.name as hospital_name, 
               b.name as branch_name 
        FROM patients p
        LEFT JOIN hospitals h ON p.hospital_id = h.id
        LEFT JOIN hospital_branches b ON p.branch_id = b.id
        WHERE p.id = $1`,
        [id],
      );
      if (rows[0]?.profile_image_url) {
        rows[0].profile_image_url = await signProfileUrl(rows[0].profile_image_url);
      }
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createPatient(data: CreatePatientInput) {
    const client = await pool.connect();
    try {
      await ensurePatientColumns(client);
      const address =
        data.address ||
        [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
          .filter(Boolean)
          .join(', ') ||
        null;

      const { rows } = await client.query(
        `INSERT INTO patients (
          user_account_id, hospital_id, branch_id, name, phone, email, date_of_birth, gender, occupation, 
          address, address_line_1, address_line_2, city, state, pincode, 
          status, height_cm, weight_kg, blood_group, marital_status, emergency_contacts, profile_image_url, is_active,
          blood_pressure, blood_sugar, body_temperature, custom_vitals,
          patient_id,
          referred_by, referral_id, referral_doctor_id, alliance_doctor_id,
          created_at, updated_at
        ) 
         VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
          COALESCE($28, 'PA_' || LPAD(nextval('patient_id_seq')::TEXT, 3, '0')),
          $29, $30, $31, $32,
          NOW(), NOW()
        ) RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
          data.occupation || null,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.status,
          data.height_cm || null,
          data.weight_kg || null,
          data.blood_group || null,
          data.marital_status || null,
          data.emergency_contacts ? JSON.stringify(data.emergency_contacts) : null,
          data.profile_image_url || null,
          data.is_active !== undefined ? data.is_active : true,
          data.blood_pressure || null,
          data.blood_sugar || null,
          data.body_temperature || null,
          data.custom_vitals ? JSON.stringify(data.custom_vitals) : '[]',
          data.patient_id || null,
          data.referred_by || null,
          data.referral_id || null,
          data.referral_doctor_id || null,
          data.alliance_doctor_id || (data.referred_by === 'ALLIANCE' ? data.referral_doctor_id : null) || null,
        ],
      );
      if (rows[0]?.profile_image_url) {
        rows[0].profile_image_url = await signProfileUrl(rows[0].profile_image_url);
      }
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updatePatient(data: UpdatePatientInput) {
    const client = await pool.connect();
    try {
      await ensurePatientColumns(client);
      const address =
        data.address !== undefined
          ? data.address
          : [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
            .filter(Boolean)
            .join(', ') || null;

      const { rows } = await client.query(
        `UPDATE patients 
         SET user_account_id = $1, hospital_id = $2, branch_id = $3, name = $4, phone = $5, email = $6, 
             date_of_birth = $7, gender = $8, occupation = $9, address = $10, address_line_1 = $11, address_line_2 = $12, 
             city = $13, state = $14, pincode = $15, status = $16, height_cm = $17, weight_kg = $18, 
             blood_group = $19, marital_status = $20, emergency_contacts = $21, profile_image_url = $22, 
             is_active = $23, blood_pressure = $24, blood_sugar = $25, body_temperature = $26, custom_vitals = $27,
             referred_by = $28, referral_id = $29, referral_doctor_id = $30, alliance_doctor_id = $31,
             updated_at = NOW() 
         WHERE id = $32 RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
          data.occupation || null,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.status,
          data.height_cm || null,
          data.weight_kg || null,
          data.blood_group || null,
          data.marital_status || null,
          data.emergency_contacts ? JSON.stringify(data.emergency_contacts) : null,
          data.profile_image_url || null,
          data.is_active !== undefined ? data.is_active : true,
          data.blood_pressure || null,
          data.blood_sugar || null,
          data.body_temperature || null,
          data.custom_vitals ? JSON.stringify(data.custom_vitals) : '[]',
          data.referred_by || null,
          data.referral_id || null,
          data.referral_doctor_id || null,
          data.alliance_doctor_id || (data.referred_by === 'ALLIANCE' ? data.referral_doctor_id : null) || null,
          data.id,
        ],
      );
      if (rows[0]?.profile_image_url) {
        rows[0].profile_image_url = await signProfileUrl(rows[0].profile_image_url);
      }
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async deletePatient(id: string) {
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query(
        'DELETE FROM patients WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const patientsService = new PatientsService();
