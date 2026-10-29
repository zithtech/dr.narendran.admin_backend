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
  user_account_id?: string | null;
  hospital_id: string;
  branch_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  height_cm?: number | null;
  weight_kg?: number | null;
  blood_group?: string | null;
  marital_status?: string | null;
  emergency_contacts?: any;
  profile_image_url?: string | null;
  is_active?: boolean | null;
}

export interface UpdatePatientInput extends CreatePatientInput {
  id: string;
}

export class PatientsService {
  async getAllPatients() {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(`
        SELECT p.*, 
               h.name as hospital_name, 
               b.name as branch_name 
        FROM patients p
        LEFT JOIN hospitals h ON p.hospital_id = h.id
        LEFT JOIN hospital_branches b ON p.branch_id = b.id
        ORDER BY p.created_at DESC
      `);

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
      const {rows} = await client.query(
        `INSERT INTO patients (user_account_id, hospital_id, branch_id, name, phone, email, date_of_birth, gender, address, status, height_cm, weight_kg, blood_group, marital_status, emergency_contacts, profile_image_url, is_active, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()) RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
          data.address || null,
          data.status,
          data.height_cm || null,
          data.weight_kg || null,
          data.blood_group || null,
          data.marital_status || null,
          data.emergency_contacts ? JSON.stringify(data.emergency_contacts) : null,
          data.profile_image_url || null,
          data.is_active !== undefined ? data.is_active : true,
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
      const {rows} = await client.query(
        `UPDATE patients 
         SET user_account_id = $1, hospital_id = $2, branch_id = $3, name = $4, phone = $5, email = $6, date_of_birth = $7, gender = $8, address = $9, status = $10, height_cm = $11, weight_kg = $12, blood_group = $13, marital_status = $14, emergency_contacts = $15, profile_image_url = $16, is_active = $17, updated_at = NOW() 
         WHERE id = $18 RETURNING *`,
        [
          data.user_account_id || null,
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.date_of_birth || null,
          data.gender || null,
          data.address || null,
          data.status,
          data.height_cm || null,
          data.weight_kg || null,
          data.blood_group || null,
          data.marital_status || null,
          data.emergency_contacts ? JSON.stringify(data.emergency_contacts) : null,
          data.profile_image_url || null,
          data.is_active !== undefined ? data.is_active : true,
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
