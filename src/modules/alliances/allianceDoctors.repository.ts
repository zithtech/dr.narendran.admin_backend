import type { PoolClient } from 'pg';
import { pool } from '@/db/pool.js';
import type { AllianceDoctor, CreateAllianceDoctorInput, UpdateAllianceDoctorInput } from './allianceDoctors.types.js';

export async function ensureAllianceDoctorsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS alliance_doctors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(150),
      specialization VARCHAR(150),
      qualification VARCHAR(255),
      experience_years INTEGER,
      gender VARCHAR(50),
      mobile_number VARCHAR(50),
      alternate_mobile_number VARCHAR(50),
      email VARCHAR(255),
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(100),
      district VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100) DEFAULT 'India',
      pincode VARCHAR(20),
      hospital_clinic_name VARCHAR(255),
      registration_number VARCHAR(100),
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_name ON alliance_doctors(name);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_category ON alliance_doctors(category);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_specialization ON alliance_doctors(specialization);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_status ON alliance_doctors(status);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_created_at ON alliance_doctors(created_at DESC);
  `);
}

export class AllianceDoctorsRepository {
  async getAll(filters?: {
    search?: string | undefined;
    category?: string | undefined;
    specialization?: string | undefined;
    status?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ doctors: AllianceDoctor[]; total: number }> {
    const client = await pool.connect();
    try {
      await ensureAllianceDoctorsTable(client);

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (filters?.status) {
        conditions.push(`UPPER(status) = $${valIdx++}`);
        values.push(filters.status.toUpperCase());
      }

      if (filters?.category) {
        conditions.push(`LOWER(category) = LOWER($${valIdx++})`);
        values.push(filters.category.trim());
      }

      if (filters?.specialization) {
        conditions.push(`LOWER(specialization) = LOWER($${valIdx++})`);
        values.push(filters.specialization.trim());
      }

      if (filters?.search && filters.search.trim()) {
        const s = `%${filters.search.trim().toLowerCase()}%`;
        conditions.push(`(
          LOWER(name) LIKE $${valIdx} OR
          LOWER(COALESCE(category, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(specialization, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(qualification, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(hospital_clinic_name, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(mobile_number, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(alternate_mobile_number, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(email, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(city, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(district, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(state, '')) LIKE $${valIdx} OR
          LOWER(COALESCE(registration_number, '')) LIKE $${valIdx}
        )`);
        values.push(s);
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await client.query(`SELECT COUNT(*)::int as count FROM alliance_doctors ${whereClause}`, values);
      const total = countRes.rows[0]?.count || 0;

      let paginationClause = '';
      if (filters?.limit && filters.limit > 0) {
        paginationClause += ` LIMIT $${valIdx++}`;
        values.push(filters.limit);
        if (filters.offset && filters.offset > 0) {
          paginationClause += ` OFFSET $${valIdx++}`;
          values.push(filters.offset);
        }
      }

      const query = `
        SELECT * FROM alliance_doctors
        ${whereClause}
        ORDER BY created_at DESC
        ${paginationClause}
      `;

      const { rows } = await client.query(query, values);
      return { doctors: rows, total };
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<AllianceDoctor | null> {
    const client = await pool.connect();
    try {
      await ensureAllianceDoctorsTable(client);
      const { rows } = await client.query(`SELECT * FROM alliance_doctors WHERE id = $1`, [id]);
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async create(data: CreateAllianceDoctorInput): Promise<AllianceDoctor> {
    const client = await pool.connect();
    try {
      await ensureAllianceDoctorsTable(client);

      const exp = data.experience_years != null && data.experience_years !== ('' as any)
        ? Number(data.experience_years)
        : null;

      const query = `
        INSERT INTO alliance_doctors (
          name, category, specialization, qualification, experience_years,
          gender, mobile_number, alternate_mobile_number, email,
          address_line_1, address_line_2, city, district, state, country, pincode,
          hospital_clinic_name, registration_number, description, status,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20,
          NOW(), NOW()
        )
        RETURNING *
      `;

      const values = [
        data.name.trim(),
        data.category?.trim() || null,
        data.specialization?.trim() || null,
        data.qualification?.trim() || null,
        Number.isNaN(exp) ? null : exp,
        data.gender?.trim() || null,
        data.mobile_number?.trim() || null,
        data.alternate_mobile_number?.trim() || null,
        data.email?.trim() || null,
        data.address_line_1?.trim() || null,
        data.address_line_2?.trim() || null,
        data.city?.trim() || null,
        data.district?.trim() || null,
        data.state?.trim() || null,
        data.country?.trim() || 'India',
        data.pincode?.trim() || null,
        data.hospital_clinic_name?.trim() || null,
        data.registration_number?.trim() || null,
        data.description?.trim() || null,
        data.status ? data.status.toUpperCase() : 'ACTIVE',
      ];

      const { rows } = await client.query(query, values);
      return rows[0];
    } finally {
      client.release();
    }
  }

  async update(id: string, data: UpdateAllianceDoctorInput): Promise<AllianceDoctor | null> {
    const client = await pool.connect();
    try {
      await ensureAllianceDoctorsTable(client);

      const existing = await this.getById(id);
      if (!existing) return null;

      const updates: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let valIdx = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${valIdx++}`);
        values.push(data.name.trim());
      }
      if (data.category !== undefined) {
        updates.push(`category = $${valIdx++}`);
        values.push(data.category?.trim() || null);
      }
      if (data.specialization !== undefined) {
        updates.push(`specialization = $${valIdx++}`);
        values.push(data.specialization?.trim() || null);
      }
      if (data.qualification !== undefined) {
        updates.push(`qualification = $${valIdx++}`);
        values.push(data.qualification?.trim() || null);
      }
      if (data.experience_years !== undefined) {
        const exp = data.experience_years != null && data.experience_years !== ('' as any)
          ? Number(data.experience_years)
          : null;
        updates.push(`experience_years = $${valIdx++}`);
        values.push(Number.isNaN(exp) ? null : exp);
      }
      if (data.gender !== undefined) {
        updates.push(`gender = $${valIdx++}`);
        values.push(data.gender?.trim() || null);
      }
      if (data.mobile_number !== undefined) {
        updates.push(`mobile_number = $${valIdx++}`);
        values.push(data.mobile_number?.trim() || null);
      }
      if (data.alternate_mobile_number !== undefined) {
        updates.push(`alternate_mobile_number = $${valIdx++}`);
        values.push(data.alternate_mobile_number?.trim() || null);
      }
      if (data.email !== undefined) {
        updates.push(`email = $${valIdx++}`);
        values.push(data.email?.trim() || null);
      }
      if (data.address_line_1 !== undefined) {
        updates.push(`address_line_1 = $${valIdx++}`);
        values.push(data.address_line_1?.trim() || null);
      }
      if (data.address_line_2 !== undefined) {
        updates.push(`address_line_2 = $${valIdx++}`);
        values.push(data.address_line_2?.trim() || null);
      }
      if (data.city !== undefined) {
        updates.push(`city = $${valIdx++}`);
        values.push(data.city?.trim() || null);
      }
      if (data.district !== undefined) {
        updates.push(`district = $${valIdx++}`);
        values.push(data.district?.trim() || null);
      }
      if (data.state !== undefined) {
        updates.push(`state = $${valIdx++}`);
        values.push(data.state?.trim() || null);
      }
      if (data.country !== undefined) {
        updates.push(`country = $${valIdx++}`);
        values.push(data.country?.trim() || 'India');
      }
      if (data.pincode !== undefined) {
        updates.push(`pincode = $${valIdx++}`);
        values.push(data.pincode?.trim() || null);
      }
      if (data.hospital_clinic_name !== undefined) {
        updates.push(`hospital_clinic_name = $${valIdx++}`);
        values.push(data.hospital_clinic_name?.trim() || null);
      }
      if (data.registration_number !== undefined) {
        updates.push(`registration_number = $${valIdx++}`);
        values.push(data.registration_number?.trim() || null);
      }
      if (data.description !== undefined) {
        updates.push(`description = $${valIdx++}`);
        values.push(data.description?.trim() || null);
      }
      if (data.status !== undefined) {
        updates.push(`status = $${valIdx++}`);
        values.push(data.status ? data.status.toUpperCase() : 'ACTIVE');
      }

      values.push(id);
      const query = `
        UPDATE alliance_doctors
        SET ${updates.join(', ')}
        WHERE id = $${valIdx}
        RETURNING *
      `;

      const { rows } = await client.query(query, values);
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await ensureAllianceDoctorsTable(client);
      const res = await client.query(`DELETE FROM alliance_doctors WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}

export const allianceDoctorsRepository = new AllianceDoctorsRepository();
