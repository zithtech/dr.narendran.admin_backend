import { generateReferenceCode, withClient } from '@/shared/index.js';

export interface CreateBranchInput {
  hospital_id: string;
  name: string;
  address?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateBranchInput extends CreateBranchInput {
  id: string;
}

let branchColumnsEnsured = false;
async function ensureBranchColumns(client: any): Promise<void> {
  if (branchColumnsEnsured) return;
  try {
    await client.query(`
      ALTER TABLE hospital_branches 
        ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
    `);
    branchColumnsEnsured = true;
  } catch (err) {
    console.error('Failed to ensure hospital_branches address columns:', err);
  }
}

export class HospitalBranchesService {
  async getAllBranches(_hospitalId?: string) {
    return withClient(async client => {
      await ensureBranchColumns(client);
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
      await ensureBranchColumns(client);
      const { rows } = await client.query(
        'SELECT * FROM hospital_branches WHERE id = $1',
        [id],
      );
      return rows[0] || null;
    });
  }

  async createBranch(data: CreateBranchInput) {
    return withClient(async client => {
      await ensureBranchColumns(client);
      const branchCode = generateReferenceCode('BRN', 3);
      const address =
        data.address ||
        [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
          .filter(Boolean)
          .join(', ') ||
        null;

      const { rows } = await client.query(
        `INSERT INTO hospital_branches (
          hospital_id, branch_code, name, address, address_line_1, address_line_2, city, state, pincode, phone, status, created_at, updated_at
        ) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
        [
          data.hospital_id,
          branchCode,
          data.name,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.phone || null,
          data.status,
        ],
      );
      return rows[0];
    });
  }

  async updateBranch(data: UpdateBranchInput) {
    return withClient(async client => {
      await ensureBranchColumns(client);
      const address =
        data.address !== undefined
          ? data.address
          : [data.address_line_1, data.address_line_2, data.city, data.state, data.pincode]
              .filter(Boolean)
              .join(', ') || null;

      const { rows } = await client.query(
        `UPDATE hospital_branches 
         SET hospital_id = $1, name = $2, address = $3, address_line_1 = $4, address_line_2 = $5, city = $6, state = $7, pincode = $8, phone = $9, status = $10, updated_at = NOW() 
         WHERE id = $11 RETURNING *`,
        [
          data.hospital_id,
          data.name,
          address,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
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
