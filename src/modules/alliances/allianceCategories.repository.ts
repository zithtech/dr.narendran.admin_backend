import type { PoolClient } from 'pg';
import { pool } from '@/db/pool.js';
import type {
  AllianceDoctorCategory,
  CreateAllianceCategoryInput,
  UpdateAllianceCategoryInput,
} from './allianceCategories.types.js';

export async function ensureAllianceCategoriesTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS alliance_doctor_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_name ON alliance_doctor_categories(name);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_status ON alliance_doctor_categories(status);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_created_at ON alliance_doctor_categories(created_at DESC);
  `);

  // Seed standard categories if table is empty
  const countRes = await client.query('SELECT COUNT(*) AS total FROM alliance_doctor_categories');
  const count = parseInt(countRes.rows[0]?.total ?? '0', 10);
  if (count === 0) {
    const defaults = [
      'Cardiology',
      'Neurology',
      'Orthopedics',
      'Pediatrics',
      'Oncology',
      'Dermatology',
      'General Medicine',
      'General Surgery',
      'Obstetrics & Gynecology',
      'ENT / Otorhinolaryngology',
      'Ophthalmology',
      'Nephrology',
      'Psychiatry',
      'Gastroenterology',
      'Pulmonology',
      'Consultant Specialist',
    ];
    for (const cat of defaults) {
      await client.query(
        `INSERT INTO alliance_doctor_categories (name, status)
         VALUES ($1, 'ACTIVE')
         ON CONFLICT (name) DO NOTHING`,
        [cat],
      );
    }
  }
}

export class AllianceCategoriesRepository {
  async getAll(filters?: {
    search?: string | undefined;
    status?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ categories: AllianceDoctorCategory[]; total: number }> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);

      const conditions: string[] = [];
      const values: any[] = [];
      let valIndex = 1;

      if (filters?.search?.trim()) {
        conditions.push(`(name ILIKE $${valIndex} OR description ILIKE $${valIndex})`);
        values.push(`%${filters.search.trim()}%`);
        valIndex++;
      }

      if (filters?.status?.trim()) {
        conditions.push(`status = $${valIndex}`);
        values.push(filters.status.trim().toUpperCase());
        valIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) AS total FROM alliance_doctor_categories ${whereClause}`;
      const countRes = await client.query(countSql, values);
      const total = parseInt(countRes.rows[0]?.total ?? '0', 10);

      let dataSql = `
        SELECT
          id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM alliance_doctor_categories
        ${whereClause}
        ORDER BY name ASC
      `;

      if (filters?.limit) {
        dataSql += ` LIMIT $${valIndex}`;
        values.push(filters.limit);
        valIndex++;

        if (filters?.offset) {
          dataSql += ` OFFSET $${valIndex}`;
          values.push(filters.offset);
          valIndex++;
        }
      }

      const dataRes = await client.query(dataSql, values);
      return {
        categories: dataRes.rows,
        total,
      };
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<AllianceDoctorCategory | null> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);
      const res = await client.query(
        `SELECT
          id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM alliance_doctor_categories
        WHERE id = $1`,
        [id],
      );
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getByName(name: string): Promise<AllianceDoctorCategory | null> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);
      const res = await client.query(
        `SELECT
          id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM alliance_doctor_categories
        WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [name],
      );
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async create(data: CreateAllianceCategoryInput): Promise<AllianceDoctorCategory> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);
      const cleanName = data.name.trim();

      const existing = await this.getByName(cleanName);
      if (existing) {
        return existing;
      }

      const res = await client.query(
        `INSERT INTO alliance_doctor_categories (
          name,
          description,
          status
        ) VALUES ($1, $2, $3)
        RETURNING
          id,
          name,
          description,
          status,
          created_at,
          updated_at`,
        [
          cleanName,
          data.description ? data.description.trim() : null,
          data.status ? data.status.toUpperCase() : 'ACTIVE',
        ],
      );
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  async update(id: string, data: UpdateAllianceCategoryInput): Promise<AllianceDoctorCategory | null> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);

      const existing = await this.getById(id);
      if (!existing) return null;

      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [id];
      let valIndex = 2;

      if (data.name !== undefined) {
        updates.push(`name = $${valIndex}`);
        values.push(data.name.trim());
        valIndex++;
      }

      if (data.description !== undefined) {
        updates.push(`description = $${valIndex}`);
        values.push(data.description ? data.description.trim() : null);
        valIndex++;
      }

      if (data.status !== undefined) {
        updates.push(`status = $${valIndex}`);
        values.push(data.status.toUpperCase());
        valIndex++;
      }

      const sql = `
        UPDATE alliance_doctor_categories
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING
          id,
          name,
          description,
          status,
          created_at,
          updated_at
      `;

      const res = await client.query(sql, values);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await ensureAllianceCategoriesTable(client);
      const res = await client.query(
        'DELETE FROM alliance_doctor_categories WHERE id = $1',
        [id],
      );
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}

export const allianceCategoriesRepository = new AllianceCategoriesRepository();

