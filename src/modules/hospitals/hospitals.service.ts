import { generateReferenceCode, withClient } from '@/shared/index.js';

export interface CreateHospitalInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateHospitalInput extends CreateHospitalInput {
  id: string;
}

export class HospitalsService {
  async getAllHospitals() {
    return withClient(async client => {
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
      const hospitalCode = generateReferenceCode('HSP', 3);
      const { rows } = await client.query(
        `INSERT INTO hospitals (name, hospital_code, address, phone, email, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
        [
          data.name,
          hospitalCode,
          data.address || null,
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
      const { rows } = await client.query(
        `UPDATE hospitals 
         SET name = $1, address = $2, phone = $3, email = $4, status = $5, updated_at = NOW() 
         WHERE id = $6 RETURNING *`,
        [
          data.name,
          data.address || null,
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
