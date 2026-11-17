import {pool} from '@/db/pool.js';
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
  return trimmed;
}

export interface CreatePatientInput {
  user_account_id?: string | null | undefined;
  hospital_id: string;
  branch_id?: string | null | undefined;
  name: string;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  date_of_birth?: string | null | undefined;
  gender?: string | null | undefined;
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
}

export interface UpdatePatientInput extends CreatePatientInput {
  id: string;
}

let patientColumnsEnsured = false;
async function ensurePatientColumns(client: any): Promise<void> {
  if (patientColumnsEnsured) return;
  try {
    await client.query(`
      ALTER TABLE patients 
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
        ADD COLUMN IF NOT EXISTS blood_pressure VARCHAR(50),
        ADD COLUMN IF NOT EXISTS blood_sugar VARCHAR(50),
        ADD COLUMN IF NOT EXISTS body_temperature VARCHAR(50),
        ADD COLUMN IF NOT EXISTS custom_vitals JSONB DEFAULT '[]'::jsonb;
    `);
    patientColumnsEnsured = true;
  } catch (err) {
    console.error('Failed to ensure patient address and vitals columns:', err);
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
        query += ` WHERE (p.name ILIKE $1 OR p.phone ILIKE $1 OR p.email ILIKE $1) `;
      }
      query += ` ORDER BY p.created_at DESC `;
      const {rows} = await client.query(query, params);

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
      const {rows} = await client.query(
        'SELECT * FROM patients WHERE id = $1',
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

      const {rows} = await client.query(
        `INSERT INTO patients (
          user_account_id, hospital_id, branch_id, name, phone, email, date_of_birth, gender, 
          address, address_line_1, address_line_2, city, state, pincode, 
          status, height_cm, weight_kg, blood_group, marital_status, emergency_contacts, profile_image_url, is_active,
          blood_pressure, blood_sugar, body_temperature, custom_vitals,
          created_at, updated_at
        ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW(), NOW()) RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
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

      const {rows} = await client.query(
        `UPDATE patients 
         SET user_account_id = $1, hospital_id = $2, branch_id = $3, name = $4, phone = $5, email = $6, 
             date_of_birth = $7, gender = $8, address = $9, address_line_1 = $10, address_line_2 = $11, 
             city = $12, state = $13, pincode = $14, status = $15, height_cm = $16, weight_kg = $17, 
             blood_group = $18, marital_status = $19, emergency_contacts = $20, profile_image_url = $21, 
             is_active = $22, blood_pressure = $23, blood_sugar = $24, body_temperature = $25, custom_vitals = $26,
             updated_at = NOW() 
         WHERE id = $27 RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
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
      const {rowCount} = await client.query(
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
