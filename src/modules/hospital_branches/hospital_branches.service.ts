import { generateReferenceCode, withClient } from '@/shared/index.js';

export interface CreateBranchInput {
  hospital_id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateBranchInput extends CreateBranchInput {
  id: string;
}

export class HospitalBranchesService {
  async getAllBranches(_hospitalId?: string) {
    return withClient(async client => {
      const { rows } = await client.query(`
        SELECT b.*, h.name as hospital_name 
        FROM hospital_branches b
        LEFT JOIN hospitals h ON b.hospital_id = h.id
        ORDER BY b.created_at DESC
      `);
      return rows;
    });
  }

  async getBranchById(id: string) {
    return withClient(async client => {
      const { rows } = await client.query(
        'SELECT * FROM hospital_branches WHERE id = $1',
        [id],
      );
      return rows[0] || null;
    });
  }

  async createBranch(data: CreateBranchInput) {
    return withClient(async client => {
      const branchCode = generateReferenceCode('BRN', 3);
      const { rows } = await client.query(
        `INSERT INTO hospital_branches (hospital_id, branch_code, name, address, phone, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
        [
          data.hospital_id,
          branchCode,
          data.name,
          data.address || null,
          data.phone || null,
          data.status,
        ],
      );
      return rows[0];
    });
  }

  async updateBranch(data: UpdateBranchInput) {
    return withClient(async client => {
      const { rows } = await client.query(
        `UPDATE hospital_branches 
         SET hospital_id = $1, name = $2, address = $3, phone = $4, status = $5, updated_at = NOW() 
         WHERE id = $6 RETURNING *`,
        [
          data.hospital_id,
          data.name,
          data.address || null,
          data.phone || null,
          data.status,
          data.id,
        ],
      );
      return rows[0] || null;
    });
  }

  async deleteBranch(id: string) {
    return withClient(async client => {
      const { rowCount } = await client.query(
        'DELETE FROM hospital_branches WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    });
  }
}

export const hospitalBranchesService = new HospitalBranchesService();
