import { pool } from '@/db/pool.js';

export interface LabSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  fullAddress: string;
  mapLink: string | null;
  startTime: string | null;
  endTime: string | null;
  timings: string | null;
  contactVisibility: boolean;
}

export interface LabRecommendationResult {
  matchFound: boolean;
  recommendedLab: LabSummary | null;
  matchedServiceName?: string;
  message?: string;
  availableLabs: LabSummary[];
}

export interface CreateLabInput {
  name: string;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  map_link?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  services?: string[];
}

export interface UpdateLabInput extends CreateLabInput {
  id: string;
}

export class LabsService {
  /**
   * Format a raw DB lab row into a clean LabSummary object.
   */
  public static formatLabRow(row: any): any {
    const addressParts = [
      row.address_line_1,
      row.address_line_2,
      row.city,
      row.state,
      row.pincode,
    ].filter(Boolean);

    const fullAddress = addressParts.join(', ');
    const timings = [row.start_time, row.end_time].filter(Boolean).join(' - ') || null;

    return {
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address_line_1: row.address_line_1 ?? null,
      address_line_2: row.address_line_2 ?? null,
      addressLine1: row.address_line_1 ?? null,
      addressLine2: row.address_line_2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.pincode ?? null,
      fullAddress,
      mapLink: row.map_link ?? null,
      map_link: row.map_link ?? null,
      startTime: row.start_time ?? null,
      endTime: row.end_time ?? null,
      start_time: row.start_time ?? null,
      end_time: row.end_time ?? null,
      timings,
      contactVisibility: row.contact_visibility ?? true,
      contact_visibility: row.contact_visibility ?? true,
      status: row.status ?? 'ACTIVE',
      services: row.services ?? [],
      portal_account: row.portal_account ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };
  }

  /**
   * Returns all active labs in the system.
   */
  public static async listActiveLabs(): Promise<any[]> {
    const res = await pool.query(`
      SELECT l.*, 
             COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as services,
             CASE 
               WHEN lpu.id IS NOT NULL THEN 
                 json_build_object(
                   'id', lpu.id, 
                   'username', lpu.username, 
                   'email', lpu.email, 
                   'status', lpu.status, 
                   'must_change_password', lpu.must_change_password, 
                   'last_login_at', lpu.last_login_at, 
                   'created_at', lpu.created_at
                 ) 
               ELSE NULL 
             END as portal_account
      FROM labs l
      LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
      LEFT JOIN lab_services s ON lsm.service_id = s.id
      LEFT JOIN lab_portal_users lpu ON lpu.lab_id = l.id
      WHERE l.status = 'ACTIVE'
      GROUP BY l.id, lpu.id
      ORDER BY l.name ASC;
    `);

    return res.rows.map(this.formatLabRow);
  }

  /**
   * Recommends a lab based on master test ID and/or prescribed test name.
   */
  public static async getLabRecommendation(input: {
    labTestId?: string | undefined;
    testName?: string | undefined;
  }): Promise<LabRecommendationResult> {
    const availableLabs = await this.listActiveLabs();

    let targetName = (input.testName || '').trim();
    let targetType = '';

    // 1. If master labTestId is provided, fetch authoritative test name and type
    if (input.labTestId) {
      try {
        const testRes = await pool.query(
          `SELECT id, name, test_type FROM lab_tests WHERE id = $1 LIMIT 1;`,
          [input.labTestId],
        );
        if (testRes.rows.length > 0) {
          const t = testRes.rows[0];
          if (!targetName) targetName = t.name;
          targetType = t.test_type || '';
        }
      } catch (e) {
        // Fallback to text matching
      }
    }

    if (!targetName && !targetType) {
      return {
        matchFound: false,
        recommendedLab: null,
        message: 'No test name provided',
        availableLabs,
      };
    }

    // 2. Query labs offering matching services via lab_service_mappings and lab_services
    const normalizedTarget = targetName.toLowerCase().trim();
    const normalizedType = targetType.toLowerCase().trim();

    let stemPattern = normalizedTarget;
    if (normalizedTarget.includes('blood') || normalizedTarget.includes('bloot')) {
      stemPattern = '%bloo%';
    } else if (normalizedTarget.includes('x-ray') || normalizedTarget.includes('xray')) {
      stemPattern = '%x%ray%';
    } else {
      stemPattern = `%${normalizedTarget}%`;
    }

    const matchQuery = `
      SELECT 
        l.id, l.name, l.phone, l.email, l.address_line_1, l.address_line_2,
        l.city, l.state, l.pincode, l.map_link, l.start_time, l.end_time, l.contact_visibility,
        s.id AS service_id, s.name AS service_name
      FROM labs l
      JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
      JOIN lab_services s ON lsm.service_id = s.id
      WHERE l.status = 'ACTIVE'
        AND s.status = 'ACTIVE'
        AND (
          LOWER(TRIM(s.name)) = $1
          OR LOWER(TRIM(s.name)) = $2
          OR LOWER(s.name) LIKE $3
          OR $1 LIKE ('%' || LOWER(TRIM(s.name)) || '%')
          OR (s.name ILIKE $4 AND $4 != '%%')
        )
      ORDER BY 
        CASE 
          WHEN LOWER(TRIM(s.name)) = $1 THEN 1
          WHEN LOWER(TRIM(s.name)) = $2 THEN 2
          ELSE 3
        END,
        l.name ASC
      LIMIT 1;
    `;

    const matchRes = await pool.query(matchQuery, [
      normalizedTarget,
      normalizedType,
      `%${normalizedTarget}%`,
      stemPattern,
    ]);

    if (matchRes.rows.length > 0) {
      const row = matchRes.rows[0];
      return {
        matchFound: true,
        recommendedLab: this.formatLabRow(row),
        matchedServiceName: row.service_name,
        availableLabs,
      };
    }

    // 3. No matching lab found for this specific test
    return {
      matchFound: false,
      recommendedLab: null,
      message: 'No matching lab found for this test',
      availableLabs,
    };
  }

  async getAllLabs() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT l.*, 
               COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as services,
               CASE 
                 WHEN lpu.id IS NOT NULL THEN 
                   json_build_object(
                     'id', lpu.id, 
                     'username', lpu.username, 
                     'email', lpu.email, 
                     'status', lpu.status, 
                     'must_change_password', lpu.must_change_password, 
                     'last_login_at', lpu.last_login_at, 
                     'created_at', lpu.created_at
                   ) 
                 ELSE NULL 
               END as portal_account
        FROM labs l
        LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
        LEFT JOIN lab_services s ON lsm.service_id = s.id
        LEFT JOIN lab_portal_users lpu ON lpu.lab_id = l.id
        GROUP BY l.id, lpu.id
        ORDER BY l.created_at DESC
      `);
      return rows;
    } finally {
      client.release();
    }
  }

  async getLabById(id: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT l.*, 
               COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as services,
               CASE 
                 WHEN lpu.id IS NOT NULL THEN 
                   json_build_object(
                     'id', lpu.id, 
                     'username', lpu.username, 
                     'email', lpu.email, 
                     'status', lpu.status, 
                     'must_change_password', lpu.must_change_password, 
                     'last_login_at', lpu.last_login_at, 
                     'created_at', lpu.created_at
                   ) 
                 ELSE NULL 
               END as portal_account
        FROM labs l
        LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
        LEFT JOIN lab_services s ON lsm.service_id = s.id
        LEFT JOIN lab_portal_users lpu ON lpu.lab_id = l.id
        WHERE l.id = $1
        GROUP BY l.id, lpu.id
      `, [id]);
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createLab(data: CreateLabInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO labs (name, address_line_1, address_line_2, city, state, pincode, phone, email, map_link, start_time, end_time, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()) RETURNING *`,
        [data.name, data.address_line_1 || null, data.address_line_2 || null, data.city || null, data.state || null, data.pincode || null, data.phone || null, data.email || null, data.map_link || null, data.start_time || null, data.end_time || null, data.status]
      );
      const lab = rows[0];

      if (data.services && data.services.length > 0) {
        for (const serviceId of data.services) {
          await client.query(
            'INSERT INTO lab_service_mappings (lab_id, service_id) VALUES ($1, $2)',
            [lab.id, serviceId]
          );
        }
      }

      const { rows: finalRows } = await client.query(`
        SELECT l.*, 
               COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as services,
               CASE 
                 WHEN lpu.id IS NOT NULL THEN 
                   json_build_object(
                     'id', lpu.id, 
                     'username', lpu.username, 
                     'email', lpu.email, 
                     'status', lpu.status, 
                     'must_change_password', lpu.must_change_password, 
                     'last_login_at', lpu.last_login_at, 
                     'created_at', lpu.created_at
                   ) 
                 ELSE NULL 
               END as portal_account
        FROM labs l
        LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
        LEFT JOIN lab_services s ON lsm.service_id = s.id
        LEFT JOIN lab_portal_users lpu ON lpu.lab_id = l.id
        WHERE l.id = $1
        GROUP BY l.id, lpu.id
      `, [lab.id]);

      await client.query('COMMIT');
      return finalRows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateLab(data: UpdateLabInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE labs 
         SET name = $1, address_line_1 = $2, address_line_2 = $3, city = $4, state = $5, pincode = $6, phone = $7, email = $8, map_link = $9, start_time = $10, end_time = $11, status = $12, updated_at = NOW() 
         WHERE id = $13 RETURNING *`,
        [data.name, data.address_line_1 || null, data.address_line_2 || null, data.city || null, data.state || null, data.pincode || null, data.phone || null, data.email || null, data.map_link || null, data.start_time || null, data.end_time || null, data.status, data.id]
      );
      
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      
      const lab = rows[0];

      if (data.services !== undefined) {
        await client.query('DELETE FROM lab_service_mappings WHERE lab_id = $1', [lab.id]);
        if (data.services.length > 0) {
          for (const serviceId of data.services) {
            await client.query(
              'INSERT INTO lab_service_mappings (lab_id, service_id) VALUES ($1, $2)',
              [lab.id, serviceId]
            );
          }
        }
      }

      const { rows: finalRows } = await client.query(`
        SELECT l.*, 
               COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as services,
               CASE 
                 WHEN lpu.id IS NOT NULL THEN 
                   json_build_object(
                     'id', lpu.id, 
                     'username', lpu.username, 
                     'email', lpu.email, 
                     'status', lpu.status, 
                     'must_change_password', lpu.must_change_password, 
                     'last_login_at', lpu.last_login_at, 
                     'created_at', lpu.created_at
                   ) 
                 ELSE NULL 
               END as portal_account
        FROM labs l
        LEFT JOIN lab_service_mappings lsm ON l.id = lsm.lab_id
        LEFT JOIN lab_services s ON lsm.service_id = s.id
        LEFT JOIN lab_portal_users lpu ON lpu.lab_id = l.id
        WHERE l.id = $1
        GROUP BY l.id, lpu.id
      `, [lab.id]);

      await client.query('COMMIT');
      return finalRows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteLab(id: string) {
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query('DELETE FROM labs WHERE id = $1', [id]);
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const labsService = new LabsService();
