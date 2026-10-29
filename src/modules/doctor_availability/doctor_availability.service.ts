import {pool} from '@/db/pool.js';
import { getDoctorAvailability as getDoctorAvailabilityRepo } from '@/modules/appointments/appointments.repository.js';

export interface CreateAvailabilityInput {
  doctor_id: string;
  branch_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export class DoctorAvailabilityService {
  async getDoctorAvailability(doctorId: string, date: string, locationId?: string | null) {
    return getDoctorAvailabilityRepo(doctorId, date, locationId);
  }

  async getAvailabilityByDoctor(doctorId: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `
        SELECT a.*, b.name as branch_name 
        FROM doctor_availability a
        JOIN hospital_branches b ON a.branch_id = b.id
        WHERE a.doctor_id = $1
        ORDER BY 
          CASE a.day_of_week
            WHEN 'MONDAY' THEN 1
            WHEN 'TUESDAY' THEN 2
            WHEN 'WEDNESDAY' THEN 3
            WHEN 'THURSDAY' THEN 4
            WHEN 'FRIDAY' THEN 5
            WHEN 'SATURDAY' THEN 6
            WHEN 'SUNDAY' THEN 7
            ELSE 8
          END,
          a.start_time
      `,
        [doctorId],
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async createAvailability(data: CreateAvailabilityInput) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `INSERT INTO doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time, status, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
        [
          data.doctor_id,
          data.branch_id,
          data.day_of_week,
          data.start_time,
          data.end_time,
          data.status,
        ],
      );
      return rows[0];
    } finally {
      client.release();
    }
  }

  async updateAvailability(id: string, data: CreateAvailabilityInput) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `UPDATE doctor_availability 
         SET branch_id = $1, day_of_week = $2, start_time = $3, end_time = $4, status = $5, updated_at = NOW() 
         WHERE id = $6 RETURNING *`,
        [
          data.branch_id,
          data.day_of_week,
          data.start_time,
          data.end_time,
          data.status,
          id,
        ],
      );
      return rows[0] || null;
    } finally {
      client.release();
    }
  }

  async deleteAvailability(id: string) {
    const client = await pool.connect();
    try {
      const {rowCount} = await client.query(
        'DELETE FROM doctor_availability WHERE id = $1',
        [id],
      );
      return rowCount !== null && rowCount > 0;
    } finally {
      client.release();
    }
  }
}

export const doctorAvailabilityService = new DoctorAvailabilityService();
