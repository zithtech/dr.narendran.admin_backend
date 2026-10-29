import { pool } from '@/db/pool.js';

export interface LinkedMedicalInput {
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
}

export const linkedMedicalsService = {
  async getAll() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT * FROM linked_medicals ORDER BY created_at DESC
      `);
      return rows;
    } finally {
      client.release();
    }
  },

  async create(data: LinkedMedicalInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO linked_medicals (
          name, address_line_1, address_line_2, city, state, pincode, 
          phone, email, map_link, start_time, end_time, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          data.name, data.address_line_1, data.address_line_2, data.city, data.state, data.pincode,
          data.phone, data.email, data.map_link, data.start_time, data.end_time, data.status
        ]
      );
      return rows[0];
    } finally {
      client.release();
    }
  },

  async update(id: string, data: LinkedMedicalInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `UPDATE linked_medicals SET 
          name = $1, address_line_1 = $2, address_line_2 = $3, city = $4, state = $5, pincode = $6, 
          phone = $7, email = $8, map_link = $9, start_time = $10, end_time = $11, status = $12, updated_at = NOW()
        WHERE id = $13 RETURNING *`,
        [
          data.name, data.address_line_1, data.address_line_2, data.city, data.state, data.pincode,
          data.phone, data.email, data.map_link, data.start_time, data.end_time, data.status, id
        ]
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  },

  async delete(id: string) {
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query(`DELETE FROM linked_medicals WHERE id = $1`, [id]);
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
};
