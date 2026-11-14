import { pool } from '@/db/pool.js';
import { NotFoundError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import { medicalTimelineService } from '../patients/medicalTimeline.service.js';
import { MedicalHistoryPdfService } from '../patients/pdf/index.js';
import type {
  AdminPatientListQuery,
  AdminPatientTimelineQuery,
} from './patientTimelines.schema.js';
import type {
  MedicalHistoryResponse,
  MedicalTimelineResponse,
} from '../patients/medicalTimeline.types.js';

async function signProfileUrl(url?: string | null): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.includes('X-Amz-Signature') || trimmed.includes('X-Amz-Algorithm')) {
    return trimmed;
  }
  if (trimmed.includes('amazonaws.com/')) {
    try {
      const parts = trimmed.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          return await s3Service.getReadUrl(decodeURIComponent(key), 86400);
        }
      }
    } catch {
      return trimmed;
    }
  }
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:')
  ) {
    try {
      const cleanKey = trimmed.replace(/^\/+/, '');
      return await s3Service.getReadUrl(cleanKey, 86400);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export interface AdminPatientListItem {
  id: string;
  user_account_id: string | null;
  hospital_id: string;
  hospital_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  status: string;
  blood_group: string | null;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPatientListResult {
  patients: AdminPatientListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalCount: number;
    totalPages: number;
  };
}

export class PatientTimelinesService {
  /**
   * Fetch paginated list of registered patients with search and filtering
   */
  async getPatients(query: AdminPatientListQuery): Promise<AdminPatientListResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];

    // Search filter
    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim()}%`;
      values.push(s);
      conditions.push(`(
        p.name ILIKE $${values.length} OR 
        p.phone ILIKE $${values.length} OR 
        p.email ILIKE $${values.length} OR 
        p.id::text ILIKE $${values.length}
      )`);
    }

    // Gender filter
    if (query.gender && query.gender.toUpperCase() !== 'ALL') {
      values.push(query.gender.toUpperCase());
      conditions.push(`UPPER(p.gender) = $${values.length}`);
    }

    // Status filter
    if (query.status && query.status.toUpperCase() !== 'ALL') {
      values.push(query.status.toUpperCase());
      conditions.push(`UPPER(p.status) = $${values.length}`);
    }

    // Registered date range
    if (query.registeredFrom && query.registeredFrom.trim()) {
      values.push(query.registeredFrom.trim());
      conditions.push(`p.created_at >= $${values.length}::timestamptz`);
    }

    if (query.registeredTo && query.registeredTo.trim()) {
      values.push(query.registeredTo.trim());
      conditions.push(`p.created_at <= $${values.length}::timestamptz`);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count query
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM patients p
      WHERE ${whereClause}
    `;
    const countRes = await pool.query(countSql, values);
    const totalCount = countRes.rows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // 2. Data query
    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const dataSql = `
      SELECT p.*,
             h.name AS hospital_name,
             b.name AS branch_name
      FROM patients p
      LEFT JOIN hospitals h ON p.hospital_id = h.id
      LEFT JOIN hospital_branches b ON p.branch_id = b.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const dataRes = await pool.query(dataSql, values);
    const patients: AdminPatientListItem[] = [];

    for (const row of dataRes.rows) {
      const signedUrl = await signProfileUrl(row.profile_image_url);
      patients.push({
        id: row.id,
        user_account_id: row.user_account_id,
        hospital_id: row.hospital_id,
        hospital_name: row.hospital_name || null,
        branch_id: row.branch_id || null,
        branch_name: row.branch_name || null,
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        date_of_birth: row.date_of_birth || null,
        gender: row.gender || null,
        address: row.address || null,
        status: row.status || 'ACTIVE',
        blood_group: row.blood_group || null,
        profile_image_url: signedUrl,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return {
      patients,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * Fetch complete medical timeline for a specific patient
   */
  async getPatientTimeline(
    patientId: string,
    query: AdminPatientTimelineQuery,
  ): Promise<MedicalTimelineResponse> {
    // Verify patient exists
    const checkRes = await pool.query(
      `SELECT id, user_account_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
      [patientId],
    );

    if (checkRes.rows.length === 0) {
      throw new NotFoundError('Patient');
    }

    // Handle year filter if provided without specific dates
    let from_date = query.from_date;
    let to_date = query.to_date;
    if (query.year && query.year.toUpperCase() !== 'ALL' && !from_date && !to_date) {
      from_date = `${query.year}-01-01`;
      to_date = `${query.year}-12-31`;
    }

    // Call existing clinical timeline engine
    return medicalTimelineService.getMedicalTimeline(patientId, {
      page: query.page,
      limit: query.limit,
      type: query.type as any,
      from_date,
      to_date,
    });
  }

  /**
   * Generate downloadable medical history PDF for patient
   */
  async getPatientHistoryPdf(patientId: string): Promise<Buffer> {
    // Verify patient exists
    const checkRes = await pool.query(
      `SELECT id, user_account_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
      [patientId],
    );

    if (checkRes.rows.length === 0) {
      throw new NotFoundError('Patient');
    }

    const history: MedicalHistoryResponse = await medicalTimelineService.getMedicalHistory(patientId, {});
    return MedicalHistoryPdfService.generatePdf(history);
  }
}

export const patientTimelinesService = new PatientTimelinesService();
