import { pool } from '@/db/pool.js';
import type { ReferralInput } from './referrals.schema.js';

export const referralsService = {
  async getAll() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT * FROM referrals ORDER BY created_at DESC
      `);
      return rows;
    } finally {
      client.release();
    }
  },

  async getById(id: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT * FROM referrals WHERE id = $1`, [id]);
      return rows[0] || null;
    } finally {
      client.release();
    }
  },

  async create(data: ReferralInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO referrals (
          name, phone, email, gender, occupation, profile_image_url,
          address_line_1, address_line_2, city, state, pincode, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          data.name,
          data.phone,
          data.email || null,
          data.gender || null,
          data.occupation || null,
          data.profile_image_url || null,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.status || 'ACTIVE',
          data.notes || null,
        ]
      );
      return rows[0];
    } finally {
      client.release();
    }
  },

  async update(id: string, data: ReferralInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `UPDATE referrals SET 
          name = $1, phone = $2, email = $3, gender = $4, occupation = $5, profile_image_url = $6,
          address_line_1 = $7, address_line_2 = $8, city = $9, state = $10, pincode = $11, status = $12, notes = $13,
          updated_at = NOW()
        WHERE id = $14 RETURNING *`,
        [
          data.name,
          data.phone,
          data.email || null,
          data.gender || null,
          data.occupation || null,
          data.profile_image_url || null,
          data.address_line_1 || null,
          data.address_line_2 || null,
          data.city || null,
          data.state || null,
          data.pincode || null,
          data.status || 'ACTIVE',
          data.notes || null,
          id,
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
      const { rowCount } = await client.query(`DELETE FROM referrals WHERE id = $1`, [id]);
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  },
};
