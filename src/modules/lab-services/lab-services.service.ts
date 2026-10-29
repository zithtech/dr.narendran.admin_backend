import { pool } from '@/db/pool.js';

export interface CreateLabServiceInput {
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateLabServiceInput extends CreateLabServiceInput {
  id: string;
}

export class LabServicesService {
  async getAllServices() {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM lab_services ORDER BY name ASC');
      return rows;
    } finally {
      client.release();
    }
  }

  async getServiceById(id: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM lab_services WHERE id = $1', [id]);
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async createService(data: CreateLabServiceInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO lab_services (name, status, created_at, updated_at) 
         VALUES ($1, $2, NOW(), NOW()) RETURNING *`,
        [data.name, data.status]
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateService(data: UpdateLabServiceInput) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `UPDATE lab_services 
         SET name = $1, status = $2, updated_at = NOW() 
         WHERE id = $3 RETURNING *`,
        [data.name, data.status, data.id]
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async deleteService(id: string) {
    const client = await pool.connect();
    try {
      const { rowCount } = await client.query('DELETE FROM lab_services WHERE id = $1', [id]);
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const labServicesService = new LabServicesService();
