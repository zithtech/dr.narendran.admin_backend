import { generateReferenceCode, withClient } from '@/shared/index.js';

export interface CreateHospitalInput {
  name: string;
  address?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateHospitalInput extends CreateHospitalInput {
  id: string;
}

let hospitalColumnsEnsured = false;
async function ensureHospitalColumns(client: any): Promise<void> {
  if (hospitalColumnsEnsured) return;
  try {
    await client.query(`
      ALTER TABLE hospitals 
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
    `);
    hospitalColumnsEnsured = true;
  } catch (err) {
    console.error('Failed to ensure hospital address columns:', err);
  }
}

export class HospitalsService {
  async getAllHospitals() {
    return withClient(async client => {
      await ensureHospitalColumns(client);
      const { rows: hospitals } = await client.query(
        'SELECT * FROM hospitals ORDER BY created_at DESC',
      );
      const { rows: branches } = await client.query(
        'SELECT * FROM hospital_branches ORDER BY name ASC',
      );

      const branchMap = new Map<string, any[]>();
      for (const b of branches) {
        if (!branchMap.has(b.hospital_id)) {
          branchMap.set(b.hospital_id, []);
        }
        branchMap.get(b.hospital_id)!.push(b);
      }

      return hospitals.map(h => ({
        ...h,
        branches: branchMap.get(h.id) || [],
      }));
    });
  }

  async getHospitalById(id: string) {
    return withClient(async client => {
      await ensureHospitalColumns(client);
      const { rows: hospitals } = await client.query(
        'SELECT * FROM hospitals WHERE id = $1',
        [id],
      );
      if (hospitals.length === 0) return null;
      const { rows: branches } = await client.query(
        'SELECT * FROM hospital_branches WHERE hospital_id = $1 ORDER BY name ASC',
        [id],
      );
      return {
        ...hospitals[0],
        branches,
      };
    });
  }

  async createHospital(data: CreateHospitalInput) {
    return withClient(async client => {
      await ensureHospitalColumns(client);
      const hospitalCode = generateReferenceCode('HSP', 3);
      const address =
        data.address ||
        [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
          .filter(Boolean)
          .join(', ') ||
        null;

      const { rows } = await client.query(
        `INSERT INTO hospitals (
          name, hospital_code, address, address_line_1, address_line_2, city, state, pincode, 
          phone, email, status, created_at, updated_at
        ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
        [
          data.name,
          hospitalCode,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.phone || null,
          data.email || null,
          data.status,
        ],
      );
      return rows[0];
    });
  }

  async updateHospital(data: UpdateHospitalInput) {
    return withClient(async client => {
      await ensureHospitalColumns(client);
      const address =
        data.address !== undefined
          ? data.address
          : [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
              .filter(Boolean)
              .join(', ') || null;

      const { rows } = await client.query(
        `UPDATE hospitals 
         SET name = $1, address = $2, address_line_1 = $3, address_line_2 = $4, city = $5, state = $6, pincode = $7, 
             phone = $8, email = $9, status = $10, updated_at = NOW() 
         WHERE id = $11 RETURNING *`,
        [
          data.name,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.phone || null,
          data.email || null,
          data.status,
          data.id,
        ],
      );
      return rows[0] || null;
    });
  }

  async deleteHospital(id: string) {
    return withClient(async client => {
      const { rowCount } = await client.query(
        'DELETE FROM hospitals WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    });
  }
}

export const hospitalsService = new HospitalsService();
