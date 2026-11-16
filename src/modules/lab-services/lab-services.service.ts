import { pool } from '@/db/pool.js';

export interface CreateLabServiceInput {
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  service_code?: string | null | undefined;
  category?: string | null | undefined;
  service_category?: string | null | undefined;
  sample_type?: string | null | undefined;
  description?: string | null | undefined;
  price?: number | null | undefined;
  service_price?: number | null | undefined;
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
      const finalPrice = data.price ?? data.service_price ?? 0;
      const finalCategory = data.category ?? data.service_category ?? null;
      const { rows } = await client.query(
        `INSERT INTO lab_services (name, status, service_code, category, service_category, sample_type, description, price, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
        [
          data.name,
          data.status,
          data.service_code || null,
          finalCategory,
          finalCategory,
          data.sample_type || null,
          data.description || null,
          finalPrice,
        ]
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateService(data: UpdateLabServiceInput) {
    const client = await pool.connect();
    try {
      const finalPrice = data.price ?? data.service_price ?? 0;
      const finalCategory = data.category ?? data.service_category ?? null;
      const { rows } = await client.query(
        `UPDATE lab_services 
         SET name = $1, status = $2, service_code = $3, category = $4, service_category = $5, sample_type = $6, description = $7, price = $8, updated_at = NOW() 
         WHERE id = $9 RETURNING *`,
        [
          data.name,
          data.status,
          data.service_code || null,
          finalCategory,
          finalCategory,
          data.sample_type || null,
          data.description || null,
          finalPrice,
          data.id,
        ]
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
