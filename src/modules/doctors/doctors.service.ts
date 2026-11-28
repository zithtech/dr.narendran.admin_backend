import { pool } from '@/db/pool.js';
import { s3Service } from '@/modules/s3/s3.service.js';

export async function signProfileUrl(url?: string | null): Promise<string | null> {
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

export interface CreateDoctorInput {
  user_account_id?: string | null;
  hospital_id?: string | null;
  branch_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  specialization?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  qualification?: string | null;
  medical_registration_number?: string | null;
  clinic_address?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  years_of_experience?: number | null;
  profile_image_url?: string | null;
  podcast_url?: string | null;
  gender?: string | null;
  is_active?: boolean | null;
}

export interface UpdateDoctorInput extends CreateDoctorInput {
  id: string;
}

export interface DoctorBranchInfo {
  id: string;
  name: string;
  address?: string | null;
}

export interface DoctorHospitalInfo {
  id: string;
  name: string;
  branches: DoctorBranchInfo[];
}

export interface HospitalDoctorSettingsResponse {
  hospitals: Array<{ id: string; name: string }>;
  selected_hospital_id: string;
  hospital_name: string;
  prefix: string;
  numeric_length: number;
  next_sequence: number;
  doctor_count: number;
  is_locked: boolean;
  preview_code: string;
  message: string | null;
}

export interface FormattedDoctorInfo {
  id: string;
  doctor_code?: string | null;
  name: string;
  specialty: string;
  clinic: string;
  rating: string;
  reviews: string;
  experience: string;
  degrees: string;
  languages: string;
  fee: string;
  initials: string;
  bio: string;
  phone?: string;
  email?: string;
  profile_image_url?: string | null;
  podcast_url?: string | null;
  gender?: string | null;
  hospitals: DoctorHospitalInfo[];

  specialization?: string;
  clinic_address?: string;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  years_of_experience?: number;
  qualification?: string;
  medical_registration_number?: string;
  hospital_id?: string;
  branch_id?: string;
  user_account_id?: string;
  status?: string;
  is_active?: boolean;
  hospital_name?: string;
  branch_name?: string;
  locations_count?: number;
  created_at?: string;
  updated_at?: string;
}

export function formatDoctorInfo(row: any, hospitals: DoctorHospitalInfo[] = []): FormattedDoctorInfo {
  const rawName = row.name || row.full_name || 'Doctor';
  const name = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
  const nameParts = rawName.replace(/^Dr\.\s*/i, '').trim().split(' ');
  const initials = nameParts.length >= 2
    ? `${nameParts[0]![0] || ''}${nameParts[1]![0] || ''}`.toUpperCase()
    : `${(nameParts[0] || 'D')[0]}${(nameParts[0] || 'N')[1] || 'N'}`.toUpperCase();

  const expYears = row.experience_years;
  const experience = expYears && expYears > 0 ? `${expYears}+ years exp.` : '15+ years exp.';

  let clinicName = 'Adyar Clinic';
  if (hospitals && hospitals.length > 0) {
    const firstHosp = hospitals[0]!;
    if (firstHosp.branches && firstHosp.branches.length > 0) {
      clinicName = `${firstHosp.name} - ${firstHosp.branches[0]!.name}`;
    } else {
      clinicName = firstHosp.name;
    }
  } else if (row.hospital_name && row.branch_name) {
    clinicName = `${row.hospital_name} - ${row.branch_name}`;
  } else if (row.hospital_name) {
    clinicName = row.hospital_name;
  } else if (row.branch_name) {
    clinicName = row.branch_name;
  } else if (row.clinic_name && row.clinic_name.trim().length > 0) {
    clinicName = row.clinic_name;
  }

  const spec = row.specialization || row.specialty || 'General Medicine';
  const degrees = row.qualifications && row.qualifications.trim().length > 0
    ? row.qualifications
    : (spec.includes('Oncology') ? 'MBBS, MS, MCh (Surgical Oncology)' : 'MBBS, MD');

  const avgRating = row.average_rating
    ? String(Number(row.average_rating).toFixed(1))
    : (row.rating || '5.0');
  const totalReviews =
    row.total_reviews !== undefined && row.total_reviews !== null
      ? String(row.total_reviews)
      : (row.reviews || '0');

  return {
    id: row.id,
    doctor_code: row.doctor_code || null,
    name,
    specialty: spec,
    clinic: clinicName,
    rating: avgRating,
    reviews: totalReviews,
    experience,
    degrees,
    languages: 'English, Tamil',
    fee: '800',
    initials,
    bio: row.bio || `Specialist in ${spec} with over 15 years of experience in clinical care, personalized treatment, and compassionate medicine.`,
    phone: row.phone || undefined,
    email: row.email || undefined,
    profile_image_url: row.profile_image_url || null,
    podcast_url: row.podcast_url || null,
    gender: row.gender ?? null,
    hospitals,
    specialization: row.specialization,
    clinic_address: row.clinic_address,
    address_line_1: row.address_line_1 ?? null,
    address_line_2: row.address_line_2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    years_of_experience: row.experience_years,
    qualification: row.qualifications,
    medical_registration_number: row.medical_registration_number,
    hospital_id: row.hospital_id,
    branch_id: row.branch_id,
    user_account_id: row.user_account_id,
    status: row.status,
    is_active: row.is_active,
    hospital_name: row.hospital_name,
    branch_name: row.branch_name,
    locations_count: Number(row.locations_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

let columnsEnsured = false;
async function ensureDoctorColumns(client: any): Promise<void> {
  if (columnsEnsured) return;
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hospital_doctor_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        prefix VARCHAR(3) NOT NULL DEFAULT 'DOC',
        next_sequence INTEGER NOT NULL DEFAULT 1,
        numeric_length INTEGER NOT NULL DEFAULT 6,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_hospital_doctor_settings_hospital UNIQUE (hospital_id)
      );

      ALTER TABLE doctors 
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
        ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
        ADD COLUMN IF NOT EXISTS podcast_url TEXT,
        ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
        ADD COLUMN IF NOT EXISTS doctor_code VARCHAR(50);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_doctor_code ON doctors(doctor_code);
    `);
    columnsEnsured = true;
  } catch (err) {
    console.error('Failed to ensure doctor address columns and settings:', err);
  }
}

export class DoctorsService {
  private async fetchHospitalsForDoctors(client: any, doctorIds: string[]): Promise<Map<string, DoctorHospitalInfo[]>> {
    const resultMap = new Map<string, DoctorHospitalInfo[]>();
    if (!doctorIds || doctorIds.length === 0) return resultMap;

    const { rows } = await client.query(`
      SELECT DISTINCT
        dhb.doctor_id,
        h.id as hospital_id,
        h.name as hospital_name,
        b.id as branch_id,
        b.name as branch_name,
        COALESCE(b.address, h.address) as branch_address
      FROM (
        SELECT doctor_id, hospital_id, branch_id FROM doctor_hospital_branch WHERE doctor_id = ANY($1::uuid[])
        UNION
        SELECT id as doctor_id, hospital_id, branch_id FROM doctors WHERE id = ANY($1::uuid[]) AND hospital_id IS NOT NULL AND branch_id IS NOT NULL
        UNION
        SELECT da.doctor_id, b2.hospital_id, da.branch_id FROM doctor_availability da JOIN hospital_branches b2 ON da.branch_id = b2.id WHERE da.doctor_id = ANY($1::uuid[])
      ) dhb
      JOIN hospitals h ON dhb.hospital_id = h.id
      JOIN hospital_branches b ON dhb.branch_id = b.id
    `, [doctorIds]);

    const doctorHospitalsMap = new Map<string, Map<string, DoctorHospitalInfo>>();
    for (const id of doctorIds) {
      doctorHospitalsMap.set(id, new Map());
    }

    for (const r of rows) {
      const hMap = doctorHospitalsMap.get(r.doctor_id);
      if (hMap) {
        if (!hMap.has(r.hospital_id)) {
          hMap.set(r.hospital_id, {
            id: r.hospital_id,
            name: r.hospital_name,
            branches: []
          });
        }
        if (r.branch_id) {
          hMap.get(r.hospital_id)!.branches.push({
            id: r.branch_id,
            name: r.branch_name,
            address: r.branch_address
          });
        }
      }
    }

    for (const [docId, hMap] of doctorHospitalsMap.entries()) {
      resultMap.set(docId, Array.from(hMap.values()));
    }
    return resultMap;
  }

  async getAllDoctors(filters?: { speciality?: string; search?: string; clinic?: string; status?: string }): Promise<FormattedDoctorInfo[]> {
    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);
      let query = `
        SELECT 
          d.id,
          d.doctor_code,
          d.name,
          d.phone,
          d.email,
          d.specialization,
          d.status,
          d.user_account_id,
          d.hospital_id,
          d.branch_id,
          d.medical_registration_number,
          d.is_active,
          h.name as hospital_name,
          b.name as branch_name,
          d.qualification as qualifications,
          d.years_of_experience as experience_years,
          NULL::text as clinic_name,
          d.clinic_address,
          d.address_line_1,
          d.address_line_2,
          d.city,
          d.state,
          d.pincode,
          d.profile_image_url,
          d.podcast_url,
          d.gender,
          d.created_at,
          d.updated_at,
          dr_stats.average_rating,
          COALESCE(dr_stats.total_reviews, 0) AS total_reviews,
          COALESCE(loc_stats.count, 0) AS locations_count
        FROM doctors d
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        LEFT JOIN (
          SELECT 
            doctor_id, 
            ROUND(AVG(rating)::numeric, 1) AS average_rating,
            COUNT(*)::int AS total_reviews
          FROM doctor_reviews 
          WHERE status = 'ACTIVE'
          GROUP BY doctor_id
        ) dr_stats ON (dr_stats.doctor_id = d.id OR dr_stats.doctor_id = d.user_account_id)
        LEFT JOIN (
          SELECT doctor_id, COUNT(*)::int as count
          FROM doctor_locations
          GROUP BY doctor_id
        ) loc_stats ON (loc_stats.doctor_id = d.id OR loc_stats.doctor_id = d.user_account_id)
        WHERE 1=1
      `;

      const params: any[] = [];

      if (filters?.status && filters.status.trim().length > 0 && filters.status.toLowerCase() !== 'all') {
        params.push(filters.status.trim().toUpperCase());
        query += ` AND UPPER(d.status) = $${params.length}`;
      }

      if (filters?.speciality && filters.speciality.trim().length > 0) {
        params.push(`%${filters.speciality.trim().toLowerCase()}%`);
        query += ` AND LOWER(COALESCE(NULLIF(d.specialization, ''), 'General Medicine')) LIKE $${params.length}`;
      }

      if (filters?.search && filters.search.trim().length > 0) {
        params.push(`%${filters.search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(d.name) LIKE $${params.length} OR LOWER(COALESCE(d.doctor_code, '')) LIKE $${params.length} OR LOWER(COALESCE(NULLIF(d.specialization, ''), 'General Medicine')) LIKE $${params.length} OR LOWER(COALESCE(h.name, '')) LIKE $${params.length})`;
      }

      if (filters?.clinic && filters.clinic.trim().length > 0) {
        params.push(`%${filters.clinic.trim().toLowerCase()}%`);
        query += ` AND (LOWER(COALESCE(h.name, '')) LIKE $${params.length} OR LOWER(COALESCE(b.name, '')) LIKE $${params.length})`;
      }

      query += ` ORDER BY d.created_at DESC`;

      const { rows } = await client.query(query, params);
      for (const r of rows) {
        if (r.profile_image_url) {
          r.profile_image_url = await signProfileUrl(r.profile_image_url);
        }
      }
      const doctorIds = rows.map((r: any) => r.id);
      const hospitalsMap = await this.fetchHospitalsForDoctors(client, doctorIds);

      return rows.map((r: any) => formatDoctorInfo(r, hospitalsMap.get(r.id) || []));
    } finally {
      client.release();
    }
  }

  async getDoctorById(id: string): Promise<FormattedDoctorInfo | null> {
    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);
      const { rows } = await client.query(`
        SELECT 
          d.id,
          d.doctor_code,
          d.name,
          d.phone,
          d.email,
          d.specialization,
          d.status,
          d.user_account_id,
          d.hospital_id,
          d.branch_id,
          d.medical_registration_number,
          d.is_active,
          h.name as hospital_name,
          b.name as branch_name,
          d.qualification as qualifications,
          d.years_of_experience as experience_years,
          NULL::text as clinic_name,
          d.clinic_address,
          d.address_line_1,
          d.address_line_2,
          d.city,
          d.state,
          d.pincode,
          d.profile_image_url,
          d.podcast_url,
          d.gender,
          d.created_at,
          d.updated_at,
          dr_stats.average_rating,
          COALESCE(dr_stats.total_reviews, 0) AS total_reviews,
          COALESCE(loc_stats.count, 0) AS locations_count
        FROM doctors d
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        LEFT JOIN (
          SELECT 
            doctor_id, 
            ROUND(AVG(rating)::numeric, 1) AS average_rating,
            COUNT(*)::int AS total_reviews
          FROM doctor_reviews 
          WHERE status = 'ACTIVE'
          GROUP BY doctor_id
        ) dr_stats ON (dr_stats.doctor_id = d.id OR dr_stats.doctor_id = d.user_account_id)
        LEFT JOIN (
          SELECT doctor_id, COUNT(*)::int as count
          FROM doctor_locations
          GROUP BY doctor_id
        ) loc_stats ON (loc_stats.doctor_id = d.id OR loc_stats.doctor_id = d.user_account_id)
        WHERE d.id = $1 OR d.user_account_id = $1
      `, [id]);

      if (rows.length === 0) return null;
      const doctorRow = rows[0];
      if (doctorRow?.profile_image_url) {
        doctorRow.profile_image_url = await signProfileUrl(doctorRow.profile_image_url);
      }
      const hospitalsMap = await this.fetchHospitalsForDoctors(client, [doctorRow.id]);

      return formatDoctorInfo(doctorRow, hospitalsMap.get(doctorRow.id) || []);
    } finally {
      client.release();
    }
  }

  async getDoctorByPhone(phone: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM doctors WHERE phone = $1', [phone]);
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getDoctorSettings(requestedHospitalId?: string): Promise<HospitalDoctorSettingsResponse> {
    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);

      const hospitalsRes = await client.query(`
        SELECT id, name FROM hospitals ORDER BY created_at ASC
      `);
      const hospitalsList: Array<{ id: string; name: string }> = hospitalsRes.rows;

      if (hospitalsList.length === 0) {
        return {
          hospitals: [],
          selected_hospital_id: '',
          hospital_name: 'Default Hospital',
          prefix: 'DOC',
          numeric_length: 6,
          next_sequence: 1,
          doctor_count: 0,
          is_locked: false,
          preview_code: 'DOC000001',
          message: null,
        };
      }

      let activeHospital = hospitalsList.find((h) => h.id === requestedHospitalId);
      if (!activeHospital) {
        activeHospital = hospitalsList[0]!;
      }
      const targetHospitalId = activeHospital.id;

      await client.query(`
        INSERT INTO hospital_doctor_settings (hospital_id, prefix, next_sequence, numeric_length)
        VALUES ($1, 'DOC', 1, 6)
        ON CONFLICT (hospital_id) DO NOTHING;
      `, [targetHospitalId]);

      const settingsRes = await client.query(`
        SELECT prefix, next_sequence, numeric_length
        FROM hospital_doctor_settings
        WHERE hospital_id = $1
      `, [targetHospitalId]);

      const setting = settingsRes.rows[0] || { prefix: 'DOC', next_sequence: 1, numeric_length: 6 };

      const countRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM doctors
        WHERE hospital_id = $1
      `, [targetHospitalId]);

      const doctorCount = Number(countRes.rows[0]?.count || 0);
      const isLocked = doctorCount > 0;
      const prefix = (setting.prefix || 'DOC').toUpperCase();
      const numLength = Number(setting.numeric_length) || 6;
      const nextSequence = Number(setting.next_sequence) || 1;

      const previewSequence = isLocked ? nextSequence : 1;
      const previewCode = `${prefix}${String(previewSequence).padStart(numLength, '0')}`;

      const message = isLocked
        ? 'Doctor records already exist. The Doctor Code prefix cannot be changed because it may affect existing doctor identification and references.'
        : null;

      return {
        hospitals: hospitalsList,
        selected_hospital_id: targetHospitalId,
        hospital_name: activeHospital.name,
        prefix,
        numeric_length: numLength,
        next_sequence: nextSequence,
        doctor_count: doctorCount,
        is_locked: isLocked,
        preview_code: previewCode,
        message,
      };
    } finally {
      client.release();
    }
  }

  async updateDoctorSettings(hospitalId: string, prefix: string): Promise<HospitalDoctorSettingsResponse> {
    const cleanPrefix = (prefix || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cleanPrefix)) {
      throw new Error('Doctor Code prefix must contain exactly three alphabetic characters');
    }

    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);

      const countRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM doctors
        WHERE hospital_id = $1
      `, [hospitalId]);

      const doctorCount = Number(countRes.rows[0]?.count || 0);
      if (doctorCount > 0) {
        throw new Error(
          'Doctor records already exist. The Doctor Code prefix cannot be changed because it may affect existing doctor identification and references.',
        );
      }

      await client.query(`
        INSERT INTO hospital_doctor_settings (hospital_id, prefix, next_sequence, numeric_length, updated_at)
        VALUES ($1, $2, 1, 6, NOW())
        ON CONFLICT (hospital_id)
        DO UPDATE SET prefix = $2, updated_at = NOW()
      `, [hospitalId, cleanPrefix]);

      return await this.getDoctorSettings(hospitalId);
    } finally {
      client.release();
    }
  }

  async createDoctor(data: CreateDoctorInput) {
    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);
      await client.query('BEGIN');

      let targetHospitalId = data.hospital_id;
      if (!targetHospitalId) {
        const defHosp = await client.query(`SELECT id FROM hospitals ORDER BY created_at ASC LIMIT 1`);
        targetHospitalId = defHosp.rows[0]?.id;
      }

      if (!targetHospitalId) {
        throw new Error('A valid hospital assignment is required to generate a doctor code.');
      }

      await client.query(`
        INSERT INTO hospital_doctor_settings (hospital_id, prefix, next_sequence, numeric_length)
        VALUES ($1, 'DOC', 1, 6)
        ON CONFLICT (hospital_id) DO NOTHING;
      `, [targetHospitalId]);

      const settingsRes = await client.query(`
        SELECT prefix, next_sequence, numeric_length
        FROM hospital_doctor_settings
        WHERE hospital_id = $1
        FOR UPDATE;
      `, [targetHospitalId]);

      const setting = settingsRes.rows[0] || { prefix: 'DOC', next_sequence: 1, numeric_length: 6 };
      const prefix = (setting.prefix || 'DOC').toUpperCase();
      const numLength = Number(setting.numeric_length) || 6;
      let seq = Number(setting.next_sequence) || 1;

      if (seq > 999999) {
        throw new Error('Doctor code sequence exhausted: maximum 999999 reached for this hospital.');
      }

      let generatedCode = `${prefix}${String(seq).padStart(numLength, '0')}`;

      while (true) {
        const conflictCheck = await client.query(`
          SELECT 1 FROM doctors 
          WHERE doctor_code = $1 
          LIMIT 1
        `, [generatedCode]);

        if (conflictCheck.rowCount === 0) {
          break;
        }

        seq++;
        if (seq > 999999) {
          throw new Error('Doctor code sequence exhausted: maximum 999999 reached for this hospital.');
        }
        generatedCode = `${prefix}${String(seq).padStart(numLength, '0')}`;
      }

      const clinicAddress =
        data.clinic_address ||
        [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
          .filter(Boolean)
          .join(', ') ||
        null;

      const { rows } = await client.query(
        `INSERT INTO doctors (
          user_account_id, hospital_id, branch_id, name, phone, email, specialization, status, 
          qualification, medical_registration_number, clinic_address, 
          address_line_1, address_line_2, city, state, pincode,
          years_of_experience, is_active, profile_image_url, podcast_url, gender,
          doctor_code,
          created_at, updated_at
        ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()) RETURNING *`,
        [
          data.user_account_id || null,
          targetHospitalId,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.specialization || null,
          data.status,
          data.qualification || null,
          data.medical_registration_number || null,
          clinicAddress,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.years_of_experience || null,
          data.is_active !== undefined ? data.is_active : true,
          data.profile_image_url || null,
          data.podcast_url || null,
          data.gender || null,
          generatedCode,
        ],
      );

      await client.query(`
        UPDATE hospital_doctor_settings
        SET next_sequence = $1, updated_at = NOW()
        WHERE hospital_id = $2
      `, [seq + 1, targetHospitalId]);

      if (rows[0]?.hospital_id && rows[0]?.branch_id) {
        await client.query(
          `INSERT INTO doctor_hospital_branch (doctor_id, hospital_id, branch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [rows[0].id, rows[0].hospital_id, rows[0].branch_id]
        );
      }

      await client.query('COMMIT');

      if (rows[0]?.profile_image_url) {
        rows[0].profile_image_url = await signProfileUrl(rows[0].profile_image_url);
      }
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateDoctor(data: UpdateDoctorInput) {
    const client = await pool.connect();
    try {
      await ensureDoctorColumns(client);
      const clinicAddress =
        data.clinic_address !== undefined
          ? data.clinic_address
          : [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
              .filter(Boolean)
              .join(', ') || null;

      const { rows } = await client.query(
        `UPDATE doctors 
         SET hospital_id = $1, branch_id = $2, name = $3, phone = $4, email = $5, specialization = $6, status = $7, 
             user_account_id = $8, qualification = $9, medical_registration_number = $10, clinic_address = $11, 
             address_line_1 = $12, address_line_2 = $13, city = $14, state = $15, pincode = $16,
             years_of_experience = $17, is_active = $18, profile_image_url = $19, podcast_url = $20, gender = $21, updated_at = NOW() 
         WHERE id = $22 RETURNING *`,
        [
          data.hospital_id,
          data.branch_id || null,
          data.name,
          data.phone || null,
          data.email || null,
          data.specialization || null,
          data.status,
          data.user_account_id || null,
          data.qualification || null,
          data.medical_registration_number || null,
          clinicAddress,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.years_of_experience || null,
          data.is_active !== undefined ? data.is_active : true,
          data.profile_image_url || null,
          data.podcast_url || null,
          data.gender || null,
          data.id,
        ],
      );
      if (rows[0]?.profile_image_url) {
        rows[0].profile_image_url = await signProfileUrl(rows[0].profile_image_url);
      }
      if (rows[0]?.hospital_id && rows[0]?.branch_id) {
        await client.query(
          `INSERT INTO doctor_hospital_branch (doctor_id, hospital_id, branch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [rows[0].id, rows[0].hospital_id, rows[0].branch_id]
        );
      }
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async deleteDoctor(id: string) {
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query(
        'DELETE FROM doctors WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const doctorsService = new DoctorsService();
