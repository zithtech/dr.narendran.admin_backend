import type { PoolClient } from 'pg';
import { pool } from '@/db/pool.js';
import { logger } from '@/lib/logger.js';
import * as repo from '../appointments/appointments.repository.js';
import { notificationService } from '../notifications/notification.service.js';
import { NotificationType } from '../notifications/notification.types.js';
import { PrescriptionTemplatesService } from '../prescription_templates/prescription_templates.service.js';
import { s3Service } from '../s3/s3.service.js';
import { medicineScheduleService } from './medicineSchedule.service.js';

export interface PrescriptionDoctorSummary {
  id: string;
  name: string;
  specialization: string;
  specialty: string;
}

export interface PrescriptionMedicineItem {
  id: string;
  prescription_id: string;
  medicine_id?: string | undefined;
  medicine_name: string;
  strength?: string | undefined;
  dosage?: string | undefined;
  frequency?: string | undefined;
  duration?: string | undefined;
  food_instruction?: string | undefined;
  instructions?: string | undefined;
  prescribed_quantity: number;
  generic_name?: string | undefined;
  dosage_form?: string | undefined;
  manufacturer?: string | undefined;
  therapeutic_category?: string | undefined;
  mrp?: number | null | undefined;
  final_price?: number | null | undefined;
}

export interface RecommendedLabDetails {
  id: string;
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  address_line_1?: string | undefined;
  address_line_2?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  pincode?: string | undefined;
  map_link?: string | undefined;
  start_time?: string | undefined;
  end_time?: string | undefined;
  contact_visibility?: boolean | undefined;
}

export interface PrescribedLabTestItem {
  id: string;
  prescription_id: string;
  lab_test_id?: string | undefined;
  test_name: string;
  instructions?: string | undefined;
  test_type?: string | undefined;
  description?: string | undefined;
  price?: number | undefined;
  lab_id?: string | undefined;
  lab_name?: string | undefined;
  lab_city?: string | undefined;
  lab_address?: string | undefined;
  lab_phone?: string | undefined;
  lab_map_link?: string | undefined;
  lab?: RecommendedLabDetails | undefined;
}

export type PrescriptionLabTestItem = PrescribedLabTestItem;

export interface FormattedPrescription {
  id: string;
  prescription_number?: string | undefined;
  patient_id?: string | undefined;
  patient_name?: string | undefined;
  patient_phone?: string | undefined;
  patient_gender?: string | undefined;
  patient_dob?: string | undefined;
  appointment_id?: string | undefined;
  prescription_date: string;
  status: "active" | "completed" | "expired" | "cancelled";
  additional_notes?: string | undefined;
  diagnosis?: string | undefined;
  doctor: PrescriptionDoctorSummary;
  medicines_count: number;
  medicines: PrescriptionMedicineItem[];
  lab_tests_count?: number;
  lab_tests?: PrescribedLabTestItem[];
  created_at: string;
  prescription_type?: string | undefined;
  image_url?: string | undefined;
  prescription_image_url?: string | undefined;
  prescription_url?: string | undefined;
  follow_up_days?: number | null | undefined;
  follow_up_date?: string | null | undefined;
  follow_up_status?: string | null | undefined;
  patient_blood_pressure?: string | null | undefined;
  patient_blood_sugar?: string | null | undefined;
  patient_body_temperature?: string | null | undefined;
  patient_height_cm?: number | null | undefined;
  patient_weight_kg?: number | null | undefined;
  patient_blood_group?: string | null | undefined;
  patient_custom_vitals?: any;
  vitals?: {
    blood_pressure?: string | null | undefined;
    blood_sugar?: string | null | undefined;
    body_temperature?: string | null | undefined;
    height_cm?: number | null | undefined;
    weight_kg?: number | null | undefined;
    blood_group?: string | null | undefined;
    custom_vitals?: any;
  } | undefined;
}

export interface CreatePrescriptionMedicineInput {
  medicineId?: string | undefined;
  name: string;
  strength?: string | undefined;
  dosage: string;
  frequency: string;
  duration: string;
  mealTiming?: string | undefined;
  instructions?: string | undefined;
  prescribedQuantity?: number | undefined;
}

export interface CreatePrescriptionLabTestInput {
  labTestId?: string | undefined;
  testName: string;
  instructions?: string | undefined;
  labId?: string | undefined;
  lab_id?: string | undefined;
}

export interface PrescriptionVitalsInput {
  blood_pressure?: string | null | undefined;
  blood_sugar?: string | null | undefined;
  body_temperature?: string | null | undefined;
  height_cm?: number | string | null | undefined;
  weight_kg?: number | string | null | undefined;
  blood_group?: string | null | undefined;
  custom_vitals?: any;
  bloodPressure?: string | null | undefined;
  bloodSugar?: string | null | undefined;
  bodyTemperature?: string | null | undefined;
  heightCm?: number | string | null | undefined;
  weightKg?: number | string | null | undefined;
  bloodGroup?: string | null | undefined;
  customVitals?: any;
}

export interface CreatePrescriptionInput {
  patientId?: string | undefined;
  doctorId?: string | undefined;
  appointmentId?: string | undefined;
  markAppointmentCompleted?: boolean | undefined;
  diagnosis?: string | undefined;
  generalInstructions?: string | undefined;
  prescriptionType?: 'system' | 'upload' | undefined;
  imageUrl?: string | undefined;
  prescriptionUrl?: string | undefined;
  followUpDays?: number | string | undefined;
  followUpDate?: string | undefined;
  medicines?: CreatePrescriptionMedicineInput[] | undefined;
  labTests?: CreatePrescriptionLabTestInput[] | undefined;
  vitals?: PrescriptionVitalsInput | undefined;
}

export interface UpdatePrescriptionInput {
  diagnosis?: string | undefined;
  generalInstructions?: string | undefined;
  status?: 'active' | 'completed' | 'expired' | 'cancelled' | undefined;
  followUpDays?: number | string | undefined;
  followUpDate?: string | undefined;
  medicines?: CreatePrescriptionMedicineInput[] | undefined;
  labTests?: CreatePrescriptionLabTestInput[] | undefined;
  vitals?: PrescriptionVitalsInput | undefined;
}

async function signS3DocumentUrl(rawUrl?: string | null): Promise<string | undefined> {
  if (!rawUrl) return undefined;
  if (rawUrl.includes('amazonaws.com')) {
    try {
      const parts = rawUrl.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          return await s3Service.getReadUrl(decodeURIComponent(key), 86400);
        }
      }
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
}

const signPrescriptionImageUrl = signS3DocumentUrl;

let prescriptionColumnsEnsured = false;
async function ensurePrescriptionColumns(client: PoolClient): Promise<boolean> {
  if (prescriptionColumnsEnsured) return true;
  try {
    await client.query(`
      ALTER TABLE prescriptions
      ADD COLUMN IF NOT EXISTS prescription_number VARCHAR(64);

      CREATE INDEX IF NOT EXISTS idx_prescriptions_prescription_number ON prescriptions (prescription_number);
    `);
    prescriptionColumnsEnsured = true;
    return true;
  } catch (err) {
    logger.warn({ err }, 'Failed to auto-ensure prescription_number column on prescriptions table');
    return false;
  }
}

async function hasPrescriptionNumberColumn(client: PoolClient): Promise<boolean> {
  const ensured = await ensurePrescriptionColumns(client);
  if (ensured) return true;
  try {
    const res = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'prescriptions' AND column_name = 'prescription_number'
      LIMIT 1
    `);
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

export class PrescriptionsService {
  private extractTwoLetterCode(name?: string | null, fallback: string = 'AN'): string {
    if (!name) return fallback;
    const cleaned = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (cleaned.length >= 2) return cleaned.slice(0, 2);
    if (cleaned.length === 1) return cleaned + 'X';
    return fallback;
  }

  private deriveFallbackPrescriptionNumber(
    id: string,
    hospitalName?: string | null,
    branchName?: string | null
  ): string {
    const hosp = this.extractTwoLetterCode(hospitalName, 'AN');
    const branch = this.extractTwoLetterCode(branchName, 'CH');
    let seq = '001';
    if (id) {
      const digitsOnly = id.replace(/\D/g, '');
      if (digitsOnly.length >= 3) {
        seq = digitsOnly.slice(-3);
      } else {
        const hex = id.replace(/[^0-9a-fA-F]/g, '').slice(-3);
        const parsed = parseInt(hex, 16) % 1000;
        seq = String(parsed || 1).padStart(3, '0');
      }
    }
    return `${hosp}-${branch}-${seq}`;
  }

  private async generatePrescriptionNumber(
    client: PoolClient,
    hospitalName?: string | null,
    branchName?: string | null
  ): Promise<string> {
    const hosp = this.extractTwoLetterCode(hospitalName, 'AN');
    const branch = this.extractTwoLetterCode(branchName, 'CH');
    const prefix = `${hosp}-${branch}-`;

    try {
      const hasRxCol = await hasPrescriptionNumberColumn(client);
      if (!hasRxCol) {
        return `${prefix}001`;
      }

      const { rows } = await client.query(
        `SELECT prescription_number 
         FROM prescriptions 
         WHERE prescription_number LIKE $1
         ORDER BY prescription_number DESC 
         LIMIT 1`,
        [`${prefix}%`]
      );

      let nextSeq = 1;
      if (rows.length > 0 && rows[0].prescription_number) {
        const parts = rows[0].prescription_number.split('-');
        const lastSeqStr = parts[parts.length - 1];
        const parsed = parseInt(lastSeqStr, 10);
        if (!isNaN(parsed) && parsed >= 1) {
          nextSeq = parsed + 1;
        }
      }

      const seqStr = String(nextSeq).padStart(3, '0');
      return `${prefix}${seqStr}`;
    } catch (err) {
      logger.warn({ err }, 'Failed to query sequence for prescription_number, fallback to timestamp sequence');
      return `${prefix}${String(Date.now() % 1000).padStart(3, '0')}`;
    }
  }

  async getPrescriptions(filters?: {
    user_id?: string | undefined;
    patient_id?: string | undefined;
    appointment_id?: string | undefined;
    doctor_id?: string | undefined;
    status?: string | undefined;
    tab?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<FormattedPrescription[]> {
    const client = await pool.connect();
    try {
      const hasRxCol = await hasPrescriptionNumberColumn(client);
      const rxColSelect = hasRxCol ? 'p.prescription_number' : 'NULL::varchar as prescription_number';

      const inputId = (filters?.patient_id || filters?.user_id)?.trim();
      let targetPatientId = inputId;
      let targetUserId = inputId;

      if (inputId) {
        const pRes = await client.query(`
          SELECT id, user_account_id, user_id FROM patients 
          WHERE (user_account_id IS NOT NULL AND user_account_id::text = $1)
             OR (user_id IS NOT NULL AND user_id::text = $1)
             OR (id::text = $1)
          LIMIT 1
        `, [inputId]);
        if (pRes.rows.length > 0) {
          targetPatientId = String(pRes.rows[0].id);
          targetUserId = String(pRes.rows[0].user_account_id || pRes.rows[0].user_id || inputId);
        }
      }

      const whereClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (targetPatientId || targetUserId) {
        whereClauses.push(
          "(p.patient_id::text = $" + paramIdx + " OR p.patient_id::text = $" + (paramIdx + 1) + " OR pat.user_account_id::text = $" + paramIdx + " OR pat.user_id::text = $" + paramIdx + ")"
        );
        params.push(targetPatientId, targetUserId);
        paramIdx += 2;
      }

      if (filters?.appointment_id) {
        whereClauses.push("p.appointment_id::text = $" + paramIdx);
        params.push(filters.appointment_id);
        paramIdx++;
      }

      if (filters?.doctor_id) {
        whereClauses.push("p.doctor_id::text = $" + paramIdx);
        params.push(filters.doctor_id);
        paramIdx++;
      }

      if (filters?.tab === "history") {
        whereClauses.push("LOWER(p.status) IN ('completed', 'expired', 'cancelled')");
      } else if (filters?.tab === "current" || filters?.status === "active") {
        whereClauses.push("LOWER(p.status) = 'active'");
      } else if (filters?.status) {
        params.push(filters.status.toLowerCase());
        whereClauses.push("LOWER(p.status) = $" + paramIdx);
        paramIdx++;
      }

      if (filters?.search && filters.search.trim().length > 0) {
        const term = `%${filters.search.trim()}%`;
        const rxColFilter = hasRxCol ? ` OR p.prescription_number ILIKE $${paramIdx}` : '';
        whereClauses.push(
          `(COALESCE(pat.name, appt.patient_name, '') ILIKE $${paramIdx} OR COALESCE(pat.phone, appt.patient_phone, '') ILIKE $${paramIdx} OR d.name ILIKE $${paramIdx} OR p.additional_notes ILIKE $${paramIdx} OR p.id::text ILIKE $${paramIdx}${rxColFilter})`
        );
        params.push(term);
        paramIdx++;
      }

      const whereClause = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

      const limit = filters?.limit && filters.limit > 0 ? filters.limit : 100;
      const offset = filters?.offset && filters.offset >= 0 ? filters.offset : 0;

      const query = `
        SELECT 
          p.id,
          ${rxColSelect},
          p.patient_id,
          p.appointment_id,
          p.prescription_date,
          p.status,
          p.additional_notes,
          p.created_at,
          p.image_url,
          p.prescription_type,
          p.prescription_url,
          p.follow_up_days,
          p.follow_up_date,
          p.follow_up_status,
          COALESCE(NULLIF(pat.name, ''), NULLIF(pat_appt.name, ''), appt.patient_name, 'Patient') as patient_name,
          COALESCE(NULLIF(pat.phone, ''), NULLIF(pat_appt.phone, ''), appt.patient_phone) as patient_phone,
          COALESCE(pat.gender, pat_appt.gender) as patient_gender,
          COALESCE(pat.date_of_birth, pat_appt.date_of_birth) as patient_dob,
          COALESCE(pat.blood_group, pat_appt.blood_group) as patient_blood_group,
          COALESCE(pat.height_cm, pat_appt.height_cm) as patient_height_cm,
          COALESCE(pat.weight_kg, pat_appt.weight_kg) as patient_weight_kg,
          COALESCE(pat.blood_pressure, pat_appt.blood_pressure) as patient_blood_pressure,
          COALESCE(pat.blood_sugar, pat_appt.blood_sugar) as patient_blood_sugar,
          COALESCE(pat.body_temperature, pat_appt.body_temperature) as patient_body_temperature,
          COALESCE(pat.custom_vitals, pat_appt.custom_vitals) as patient_custom_vitals,
          d.id as doctor_id,
          d.name as doctor_name,
          COALESCE(NULLIF(d.specialization, ''), 'General Medicine') as doctor_specialty,
          h.name as hospital_name,
          b.name as branch_name
        FROM prescriptions p
        LEFT JOIN patients pat ON (
          p.patient_id = pat.id 
          OR p.patient_id = pat.user_account_id 
          OR p.patient_id = pat.user_id
        )
        LEFT JOIN appointments appt ON p.appointment_id = appt.id
        LEFT JOIN patients pat_appt ON (
          pat.id IS NULL AND (
            appt.patient_id = pat_appt.id 
            OR appt.patient_id = pat_appt.user_account_id 
            OR appt.patient_id = pat_appt.user_id
          )
        )
        LEFT JOIN doctors d ON p.doctor_id = d.id
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        ${whereClause}
        ORDER BY p.prescription_date DESC, p.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `;
      params.push(limit, offset);

      const { rows } = await client.query(query, params);
      if (rows.length === 0) return [];

      const rxIds = rows.map((r: any) => r.id);

      const medRes = await client.query(`
        SELECT pm.*, 
               m.generic_name, 
               m.dosage_form, 
               m.manufacturer, 
               m.therapeutic_category, 
               m.mrp, 
               m.final_price
        FROM prescription_medicines pm
        LEFT JOIN medicines m ON pm.medicine_id = m.id
        WHERE pm.prescription_id = ANY($1::uuid[])
        ORDER BY pm.created_at ASC
      `, [rxIds]);

      const medMap = new Map<string, PrescriptionMedicineItem[]>();
      for (const m of medRes.rows) {
        if (!medMap.has(m.prescription_id)) {
          medMap.set(m.prescription_id, []);
        }
        medMap.get(m.prescription_id)!.push({
          id: m.id,
          prescription_id: m.prescription_id,
          medicine_id: m.medicine_id || undefined,
          medicine_name: m.medicine_name,
          strength: m.strength || undefined,
          dosage: m.dosage || undefined,
          frequency: m.frequency || undefined,
          duration: m.duration || undefined,
          food_instruction: m.food_instruction || undefined,
          instructions: m.instructions || undefined,
          prescribed_quantity: parseInt(m.prescribed_quantity, 10) || 1,
          generic_name: m.generic_name || undefined,
          dosage_form: m.dosage_form || undefined,
          manufacturer: m.manufacturer || undefined,
          therapeutic_category: m.therapeutic_category || undefined,
          mrp: m.mrp != null ? Number(m.mrp) : null,
          final_price: m.final_price != null ? Number(m.final_price) : null,
        });
      }

      const labRes = await client.query(`
        SELECT 
          plt.id,
          plt.prescription_id,
          plt.lab_test_id,
          plt.test_name,
          plt.instructions,
          plt.lab_id,
          plt.created_at,
          lt.test_type,
          lt.description as test_description,
          lt.price as test_price,
          l.id as lab_id_val,
          l.name as lab_name,
          l.phone as lab_phone,
          l.email as lab_email,
          l.address_line_1,
          l.address_line_2,
          l.city as lab_city,
          l.state,
          l.pincode,
          l.map_link as lab_map_link,
          l.start_time,
          l.end_time,
          l.contact_visibility,
          CONCAT_WS(', ', NULLIF(l.address_line_1, ''), NULLIF(l.address_line_2, ''), NULLIF(l.city, '')) as lab_address
        FROM prescription_lab_tests plt
        LEFT JOIN lab_tests lt ON plt.lab_test_id = lt.id
        LEFT JOIN labs l ON plt.lab_id = l.id
        WHERE plt.prescription_id = ANY($1::uuid[])
        ORDER BY plt.created_at ASC
      `, [rxIds]);

      const labMap = new Map<string, PrescribedLabTestItem[]>();
      for (const row of labRes.rows) {
        if (!labMap.has(row.prescription_id)) {
          labMap.set(row.prescription_id, []);
        }
        const labItem: PrescribedLabTestItem = {
          id: row.id,
          prescription_id: row.prescription_id,
          lab_test_id: row.lab_test_id || undefined,
          test_name: row.test_name,
          instructions: row.instructions || undefined,
          test_type: row.test_type || undefined,
          description: row.test_description || undefined,
          price: row.test_price != null ? Number(row.test_price) : undefined,
          lab_id: row.lab_id || undefined,
          lab_name: row.lab_name || undefined,
          lab_city: row.lab_city || undefined,
          lab_address: row.lab_address || undefined,
          lab_phone: row.contact_visibility !== false ? (row.lab_phone || undefined) : undefined,
          lab_map_link: row.lab_map_link || undefined,
        };
        if (row.lab_id && row.lab_name) {
          labItem.lab = {
            id: row.lab_id_val || row.lab_id,
            name: row.lab_name,
            phone: row.contact_visibility !== false ? (row.lab_phone || undefined) : undefined,
            email: row.lab_email || undefined,
            address_line_1: row.address_line_1 || undefined,
            address_line_2: row.address_line_2 || undefined,
            city: row.lab_city || undefined,
            state: row.state || undefined,
            pincode: row.pincode || undefined,
            map_link: row.lab_map_link || undefined,
            start_time: row.start_time || undefined,
            end_time: row.end_time || undefined,
            contact_visibility: row.contact_visibility,
          };
        }
        labMap.get(row.prescription_id)!.push(labItem);
      }

      const result: FormattedPrescription[] = [];
      for (const r of rows) {
        const meds = medMap.get(r.id) || [];
        const labs = labMap.get(r.id) || [];
        const dateStr = typeof r.prescription_date === "string"
          ? r.prescription_date.split("T")[0]
          : (r.prescription_date ? r.prescription_date.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
        const signedImageUrl = await signPrescriptionImageUrl(r.image_url);
        const signedPrescriptionUrl = await signPrescriptionImageUrl(r.prescription_url);
        result.push({
          id: r.id,
          prescription_number: r.prescription_number || this.deriveFallbackPrescriptionNumber(r.id, r.hospital_name, r.branch_name),
          patient_id: r.patient_id || undefined,
          patient_name: r.patient_name || undefined,
          patient_phone: r.patient_phone || undefined,
          patient_gender: r.patient_gender || undefined,
          patient_dob: r.patient_dob ? new Date(r.patient_dob).toISOString().split('T')[0] : undefined,
          appointment_id: r.appointment_id || undefined,
          prescription_date: dateStr,
          status: (r.status || "active").toLowerCase() as any,
          additional_notes: r.additional_notes || undefined,
          diagnosis: r.additional_notes || undefined,
          doctor: {
            id: r.doctor_id || "dr-default",
            name: r.doctor_name ? `Dr. ${r.doctor_name.replace(/^Dr\.\s*/i, "")}` : "Dr. Narendran",
            specialization: r.doctor_specialty || "General Medicine",
            specialty: r.doctor_specialty || "General Medicine",
          },
          medicines_count: meds.length,
          medicines: meds,
          lab_tests_count: labs.length,
          lab_tests: labs,
          created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
          image_url: signedImageUrl,
          prescription_image_url: signedImageUrl,
          prescription_url: signedPrescriptionUrl || undefined,
          prescription_type: r.prescription_type || undefined,
          follow_up_days: r.follow_up_days != null ? Number(r.follow_up_days) : null,
          follow_up_date: r.follow_up_date ? (typeof r.follow_up_date === 'string' ? r.follow_up_date.split('T')[0] : new Date(r.follow_up_date).toISOString().split('T')[0]) : null,
          follow_up_status: r.follow_up_status || null,
        });
      }
      return result;
    } finally {
      client.release();
    }
  }

  async getPrescriptionById(id: string): Promise<FormattedPrescription | null> {
    const client = await pool.connect();
    try {
      const hasRxCol = await hasPrescriptionNumberColumn(client);
      const rxColSelect = hasRxCol ? 'p.prescription_number' : 'NULL::varchar as prescription_number';
      const whereCondition = hasRxCol
        ? '(p.id::text = $1 OR p.prescription_number = $1)'
        : 'p.id::text = $1';

      const { rows } = await client.query(`
        SELECT 
          p.id,
          ${rxColSelect},
          p.patient_id,
          p.appointment_id,
          p.prescription_date,
          p.status,
          p.additional_notes,
          p.created_at,
          p.image_url,
          p.prescription_type,
          p.prescription_url,
          p.follow_up_days,
          p.follow_up_date,
          p.follow_up_status,
          COALESCE(NULLIF(pat.name, ''), NULLIF(pat_appt.name, ''), appt.patient_name, 'Patient') as patient_name,
          COALESCE(NULLIF(pat.phone, ''), NULLIF(pat_appt.phone, ''), appt.patient_phone) as patient_phone,
          COALESCE(pat.gender, pat_appt.gender) as patient_gender,
          COALESCE(pat.date_of_birth, pat_appt.date_of_birth) as patient_dob,
          COALESCE(pat.blood_group, pat_appt.blood_group) as patient_blood_group,
          COALESCE(pat.height_cm, pat_appt.height_cm) as patient_height_cm,
          COALESCE(pat.weight_kg, pat_appt.weight_kg) as patient_weight_kg,
          COALESCE(pat.blood_pressure, pat_appt.blood_pressure) as patient_blood_pressure,
          COALESCE(pat.blood_sugar, pat_appt.blood_sugar) as patient_blood_sugar,
          COALESCE(pat.body_temperature, pat_appt.body_temperature) as patient_body_temperature,
          COALESCE(pat.custom_vitals, pat_appt.custom_vitals) as patient_custom_vitals,
          d.id as doctor_id,
          d.name as doctor_name,
          COALESCE(NULLIF(d.specialization, ''), 'General Medicine') as doctor_specialty,
          h.name as hospital_name,
          b.name as branch_name
        FROM prescriptions p
        LEFT JOIN patients pat ON (
          p.patient_id = pat.id 
          OR p.patient_id = pat.user_account_id 
          OR p.patient_id = pat.user_id
        )
        LEFT JOIN appointments appt ON p.appointment_id = appt.id
        LEFT JOIN patients pat_appt ON (
          pat.id IS NULL AND (
            appt.patient_id = pat_appt.id 
            OR appt.patient_id = pat_appt.user_account_id 
            OR appt.patient_id = pat_appt.user_id
          )
        )
        LEFT JOIN doctors d ON p.doctor_id = d.id
        LEFT JOIN hospitals h ON d.hospital_id = h.id
        LEFT JOIN hospital_branches b ON d.branch_id = b.id
        WHERE ${whereCondition}
      `, [id]);

      if (rows.length === 0) return null;
      const r = rows[0];

      const medRes = await client.query(`
        SELECT pm.*, 
               m.generic_name, 
               m.dosage_form, 
               m.manufacturer, 
               m.therapeutic_category, 
               m.mrp, 
               m.final_price
        FROM prescription_medicines pm
        LEFT JOIN medicines m ON pm.medicine_id = m.id
        WHERE pm.prescription_id = $1
        ORDER BY pm.created_at ASC
      `, [id]);

      const meds: PrescriptionMedicineItem[] = medRes.rows.map((m: any) => ({
        id: m.id,
        prescription_id: m.prescription_id,
        medicine_id: m.medicine_id || undefined,
        medicine_name: m.medicine_name,
        strength: m.strength || undefined,
        dosage: m.dosage || undefined,
        frequency: m.frequency || undefined,
        duration: m.duration || undefined,
        food_instruction: m.food_instruction || undefined,
        instructions: m.instructions || undefined,
        prescribed_quantity: parseInt(m.prescribed_quantity, 10) || 1,
        generic_name: m.generic_name || undefined,
        dosage_form: m.dosage_form || undefined,
        manufacturer: m.manufacturer || undefined,
        therapeutic_category: m.therapeutic_category || undefined,
        mrp: m.mrp != null ? Number(m.mrp) : null,
        final_price: m.final_price != null ? Number(m.final_price) : null,
      }));

      const labRes = await client.query(`
        SELECT 
          plt.id,
          plt.prescription_id,
          plt.lab_test_id,
          plt.test_name,
          plt.instructions,
          plt.lab_id,
          plt.created_at,
          lt.test_type,
          lt.description as test_description,
          lt.price as test_price,
          l.id as lab_id_val,
          l.name as lab_name,
          l.phone as lab_phone,
          l.email as lab_email,
          l.address_line_1,
          l.address_line_2,
          l.city as lab_city,
          l.state,
          l.pincode,
          l.map_link as lab_map_link,
          l.start_time,
          l.end_time,
          l.contact_visibility,
          CONCAT_WS(', ', NULLIF(l.address_line_1, ''), NULLIF(l.address_line_2, ''), NULLIF(l.city, '')) as lab_address
        FROM prescription_lab_tests plt
        LEFT JOIN lab_tests lt ON plt.lab_test_id = lt.id
        LEFT JOIN labs l ON plt.lab_id = l.id
        WHERE plt.prescription_id = $1
        ORDER BY plt.created_at ASC
      `, [id]);

      const labs: PrescribedLabTestItem[] = labRes.rows.map((row: any) => {
        const labItem: PrescribedLabTestItem = {
          id: row.id,
          prescription_id: row.prescription_id,
          lab_test_id: row.lab_test_id || undefined,
          test_name: row.test_name,
          instructions: row.instructions || undefined,
          test_type: row.test_type || undefined,
          description: row.test_description || undefined,
          price: row.test_price != null ? Number(row.test_price) : undefined,
          lab_id: row.lab_id || undefined,
          lab_name: row.lab_name || undefined,
          lab_city: row.lab_city || undefined,
          lab_address: row.lab_address || undefined,
          lab_phone: row.contact_visibility !== false ? (row.lab_phone || undefined) : undefined,
          lab_map_link: row.lab_map_link || undefined,
        };
        if (row.lab_id && row.lab_name) {
          labItem.lab = {
            id: row.lab_id_val || row.lab_id,
            name: row.lab_name,
            phone: row.contact_visibility !== false ? (row.lab_phone || undefined) : undefined,
            email: row.lab_email || undefined,
            address_line_1: row.address_line_1 || undefined,
            address_line_2: row.address_line_2 || undefined,
            city: row.lab_city || undefined,
            state: row.state || undefined,
            pincode: row.pincode || undefined,
            map_link: row.lab_map_link || undefined,
            start_time: row.start_time || undefined,
            end_time: row.end_time || undefined,
            contact_visibility: row.contact_visibility,
          };
        }
        return labItem;
      });

      const dateStr = typeof r.prescription_date === "string"
        ? r.prescription_date.split("T")[0]
        : (r.prescription_date ? r.prescription_date.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

      const signedImageUrl = await signPrescriptionImageUrl(r.image_url);
      const signedPrescriptionUrl = await signPrescriptionImageUrl(r.prescription_url);

      return {
        id: r.id,
        prescription_number: r.prescription_number || this.deriveFallbackPrescriptionNumber(r.id, r.hospital_name, r.branch_name),
        patient_id: r.patient_id || undefined,
        patient_name: r.patient_name || undefined,
        patient_phone: r.patient_phone || undefined,
        patient_gender: r.patient_gender || undefined,
        patient_dob: r.patient_dob ? new Date(r.patient_dob).toISOString().split('T')[0] : undefined,
        appointment_id: r.appointment_id || undefined,
        prescription_date: dateStr,
        status: (r.status || "active").toLowerCase() as any,
        additional_notes: r.additional_notes || undefined,
        diagnosis: r.additional_notes || undefined,
        doctor: {
          id: r.doctor_id || "dr-default",
          name: r.doctor_name ? `Dr. ${r.doctor_name.replace(/^Dr\.\s*/i, "")}` : "Dr. Narendran",
          specialization: r.doctor_specialty || "General Medicine",
          specialty: r.doctor_specialty || "General Medicine",
        },
        medicines_count: meds.length,
        medicines: meds,
        lab_tests_count: labs.length,
        lab_tests: labs,
        created_at: r.created_at ? r.created_at.toISOString() : new Date().toISOString(),
        image_url: signedImageUrl,
        prescription_image_url: signedImageUrl,
        prescription_url: signedPrescriptionUrl || undefined,
        prescription_type: r.prescription_type || undefined,
        follow_up_days: r.follow_up_days != null ? Number(r.follow_up_days) : null,
        follow_up_date: r.follow_up_date ? (typeof r.follow_up_date === 'string' ? r.follow_up_date.split('T')[0] : new Date(r.follow_up_date).toISOString().split('T')[0]) : null,
        follow_up_status: r.follow_up_status || null,
        patient_blood_pressure: r.patient_blood_pressure || undefined,
        patient_blood_sugar: r.patient_blood_sugar || undefined,
        patient_body_temperature: r.patient_body_temperature || undefined,
        patient_height_cm: r.patient_height_cm != null ? Number(r.patient_height_cm) : undefined,
        patient_weight_kg: r.patient_weight_kg != null ? Number(r.patient_weight_kg) : undefined,
        patient_blood_group: r.patient_blood_group || undefined,
        patient_custom_vitals: r.patient_custom_vitals || undefined,
        vitals: {
          blood_pressure: r.patient_blood_pressure || undefined,
          blood_sugar: r.patient_blood_sugar || undefined,
          body_temperature: r.patient_body_temperature || undefined,
          height_cm: r.patient_height_cm != null ? Number(r.patient_height_cm) : undefined,
          weight_kg: r.patient_weight_kg != null ? Number(r.patient_weight_kg) : undefined,
          blood_group: r.patient_blood_group || undefined,
          custom_vitals: r.patient_custom_vitals || undefined,
        },
      };
    } finally {
      client.release();
    }
  }

  async createPrescription(
    input: CreatePrescriptionInput,
    actorUserId?: string
  ): Promise<FormattedPrescription> {
    const isUpload = input.prescriptionType === 'upload';

    if (!isUpload && !input.medicines?.length && !input.labTests?.length) {
      throw new Error('At least one medicine or lab test is required for prescription');
    }
    if (isUpload && !input.imageUrl) {
      throw new Error('Image URL is required for upload prescriptions');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Resolve Patient ID
      let resolvedPatientId = input.patientId;
      if (!resolvedPatientId && input.appointmentId) {
        const apptRes = await client.query(
          'SELECT patient_id FROM appointments WHERE id = $1',
          [input.appointmentId],
        );
        resolvedPatientId = apptRes.rows[0]?.patient_id ?? null;
      }

      if (!resolvedPatientId) {
        throw new Error('Patient ID is required');
      }

      // Check patient exists
      const patRes = await client.query(
        `SELECT id, name, phone, gender, date_of_birth, user_account_id,
                blood_pressure, blood_sugar, body_temperature, height_cm, weight_kg, blood_group, custom_vitals
         FROM patients WHERE id = $1 LIMIT 1`,
        [resolvedPatientId]
      );
      let patientMeta = patRes.rows[0];
      if (!patientMeta) {
        // Fallback: see if resolvedPatientId is a user_account_id or user_id
        const patByUa = await client.query(
          `SELECT id, name, phone, gender, date_of_birth, user_account_id,
                  blood_pressure, blood_sugar, body_temperature, height_cm, weight_kg, blood_group, custom_vitals
           FROM patients WHERE user_account_id = $1 OR user_id = $1 LIMIT 1`,
          [resolvedPatientId]
        );
        if (patByUa.rows.length > 0) {
          resolvedPatientId = patByUa.rows[0].id;
          patientMeta = patByUa.rows[0];
        }
      }
      if (!patientMeta && input.appointmentId) {
        const apptPatRes = await client.query(
          `SELECT patient_name, patient_phone FROM appointments WHERE id = $1 LIMIT 1`,
          [input.appointmentId]
        );
        if (apptPatRes.rows.length > 0) {
          patientMeta = {
            id: resolvedPatientId,
            name: apptPatRes.rows[0].patient_name,
            phone: apptPatRes.rows[0].patient_phone,
          };
        }
      }
      patientMeta = patientMeta || {};

      // If vitals were supplied during prescription creation, update the patient's record
      if (input.vitals && resolvedPatientId) {
        try {
          const v = input.vitals;
          const bp = v.blood_pressure ?? v.bloodPressure ?? null;
          const bs = v.blood_sugar ?? v.bloodSugar ?? null;
          const bt = v.body_temperature ?? v.bodyTemperature ?? null;
          const hVal = v.height_cm != null ? Number(v.height_cm) : (v.heightCm != null ? Number(v.heightCm) : null);
          const wVal = v.weight_kg != null ? Number(v.weight_kg) : (v.weightKg != null ? Number(v.weightKg) : null);
          const bg = v.blood_group ?? v.bloodGroup ?? null;
          const cv = v.custom_vitals ? JSON.stringify(v.custom_vitals) : (v.customVitals ? JSON.stringify(v.customVitals) : null);

          await client.query(`
            UPDATE patients SET
              blood_pressure = COALESCE($1, blood_pressure),
              blood_sugar = COALESCE($2, blood_sugar),
              body_temperature = COALESCE($3, body_temperature),
              height_cm = COALESCE($4, height_cm),
              weight_kg = COALESCE($5, weight_kg),
              blood_group = COALESCE($6, blood_group),
              custom_vitals = COALESCE($7::jsonb, custom_vitals),
              updated_at = NOW()
            WHERE id = $8
          `, [bp, bs, bt, hVal, wVal, bg, cv, resolvedPatientId]);

          patientMeta = {
            ...patientMeta,
            ...(bp ? { blood_pressure: bp } : {}),
            ...(bs ? { blood_sugar: bs } : {}),
            ...(bt ? { body_temperature: bt } : {}),
            ...(hVal != null ? { height_cm: hVal } : {}),
            ...(wVal != null ? { weight_kg: wVal } : {}),
            ...(bg ? { blood_group: bg } : {}),
            ...(v.custom_vitals || v.customVitals ? { custom_vitals: v.custom_vitals || v.customVitals } : {}),
          };
        } catch (vitErr) {
          logger.warn({ err: vitErr }, 'Warning updating patient vitals on prescription create');
        }
      }

      // 2. Resolve Doctor ID
      let resolvedDoctorId: string | null | undefined = input.doctorId;
      if (!resolvedDoctorId && input.appointmentId) {
        const apptDocRes = await client.query('SELECT doctor_id FROM appointments WHERE id = $1', [input.appointmentId]);
        resolvedDoctorId = apptDocRes.rows[0]?.doctor_id ?? null;
      }
      if (!resolvedDoctorId && actorUserId) {
        resolvedDoctorId = await repo.getDoctorIdByUserId(actorUserId);
      }
      if (!resolvedDoctorId) {
        const defaultDocRes = await client.query('SELECT id FROM doctors WHERE is_active = true LIMIT 1');
        resolvedDoctorId = defaultDocRes.rows[0]?.id ?? null;
      }

      // 3. Follow-up calculations
      let calculatedFollowUpDate: string | null = null;
      let followUpDaysNum: number | null = null;
      if (input.followUpDays !== undefined && input.followUpDays !== null && Number(input.followUpDays) > 0) {
        followUpDaysNum = Number(input.followUpDays);
        const d = new Date();
        d.setDate(d.getDate() + followUpDaysNum);
        calculatedFollowUpDate = d.toISOString().split('T')[0] ?? null;
      } else if (input.followUpDate) {
        const parsedDate = new Date(input.followUpDate);
        calculatedFollowUpDate = parsedDate.toISOString().split('T')[0] ?? null;
        const diffMs = parsedDate.getTime() - new Date().setHours(0, 0, 0, 0);
        followUpDaysNum = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      }

      // 4. Query Doctor, Hospital, Branch metadata
      const docRes = await client.query(
        `SELECT d.id, d.name, d.qualification, d.specialization, d.medical_registration_number,
                d.phone, d.email, d.clinic_address,
                h.name as hospital_name, h.address as hospital_address, h.phone as hospital_phone, h.email as hospital_email,
                b.name as branch_name, b.address as branch_address, b.phone as branch_phone
         FROM doctors d
         LEFT JOIN hospitals h ON d.hospital_id = h.id
         LEFT JOIN hospital_branches b ON d.branch_id = b.id
         WHERE d.id = $1`,
        [resolvedDoctorId]
      );
      const docMeta = docRes.rows[0] || {};
      const prescriptionNumber = await this.generatePrescriptionNumber(
        client,
        docMeta.hospital_name,
        docMeta.branch_name
      );

      // 5. PDF generation & upload
      let finalPrescriptionUrl = input.prescriptionUrl || input.imageUrl || null;

      if (!isUpload && !finalPrescriptionUrl) {
        try {
          const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate();

          let labDetailsMap: Record<string, any> = {};
          const labIds = (input.labTests || []).map((l) => l.labId || l.lab_id).filter(Boolean);
          if (labIds.length > 0) {
            const labsInfoRes = await client.query(
              `SELECT id, name, city, phone, email,
                      CONCAT_WS(', ', NULLIF(address_line_1, ''), NULLIF(address_line_2, ''), NULLIF(city, '')) as address
               FROM labs WHERE id = ANY($1::uuid[])`,
              [labIds],
            );
            for (const row of labsInfoRes.rows) {
              labDetailsMap[row.id] = row;
            }
          }

          const dataContext = {
            hospital: {
              name: docMeta.hospital_name || 'Dr. Narendran Care Center',
              address: docMeta.hospital_address || '',
              phone: docMeta.hospital_phone || '+91 44 2829 0000',
              email: docMeta.hospital_email || '',
            },
            branch: {
              name: docMeta.branch_name || '',
              address: docMeta.branch_address || '',
              phone: docMeta.branch_phone || '',
            },
            doctor: {
              name: docMeta.name || 'Dr. Narendran',
              qualification: docMeta.qualification || 'MBBS, MD',
              specialization: docMeta.specialization || 'General Medicine',
              medical_registration_number: docMeta.medical_registration_number || '',
              phone: docMeta.phone || '',
              email: docMeta.email || '',
              clinic_address: docMeta.clinic_address || '',
            },
            patient: {
              name: patientMeta.name || 'Patient',
              patient_id: resolvedPatientId ? String(resolvedPatientId).slice(0, 8).toUpperCase() : '',
              phone: patientMeta.phone || '',
              gender: patientMeta.gender || '',
              date_of_birth: patientMeta.date_of_birth ? new Date(patientMeta.date_of_birth).toLocaleDateString('en-GB') : '',
              blood_pressure: patientMeta.blood_pressure || '',
              blood_sugar: patientMeta.blood_sugar || '',
              body_temperature: patientMeta.body_temperature || '',
              blood_group: patientMeta.blood_group || '',
              height_cm: patientMeta.height_cm || null,
              weight_kg: patientMeta.weight_kg || null,
              custom_vitals: patientMeta.custom_vitals || [],
            },
            prescription: {
              id: prescriptionNumber,
              prescription_id: prescriptionNumber,
              prescription_number: prescriptionNumber,
              prescription_date: new Date().toISOString(),
              appointment_id: input.appointmentId || '',
              diagnosis: input.diagnosis || '',
              additional_notes: input.generalInstructions || input.diagnosis || '',
              follow_up_days: followUpDaysNum,
              follow_up_date: calculatedFollowUpDate,
              medicines: input.medicines?.map((m) => ({
                name: m.name,
                dosage: m.dosage,
                strength: m.strength,
                frequency: m.frequency,
                duration: m.duration,
                mealTiming: m.mealTiming,
                instructions: m.instructions,
              })),
              lab_tests: input.labTests?.map((l) => {
                const lid = l.labId || l.lab_id;
                const assignedLab = lid ? labDetailsMap[lid] : null;
                return {
                  testName: l.testName,
                  instructions: l.instructions,
                  lab_id: lid || null,
                  lab_name: assignedLab?.name || null,
                  lab_city: assignedLab?.city || null,
                  lab_address: assignedLab?.address || null,
                  lab_phone: assignedLab?.phone || null,
                };
              }),
            },
          };

          const resolvedHtml = PrescriptionTemplatesService.resolveTemplate(activeTemplate.html_content, dataContext);
          const generatedPdfBuffer = await PrescriptionTemplatesService.generatePdfBuffer(resolvedHtml);

          try {
            const key = `prescriptions/${resolvedDoctorId}/presc_${Date.now()}.pdf`;
            const uploadResult = await s3Service.uploadBuffer(key, generatedPdfBuffer, 'application/pdf');
            const signedUrl = await s3Service.getReadUrl(key, 604800);
            finalPrescriptionUrl = signedUrl || uploadResult.fileUrl;
          } catch (s3Err) {
            logger.warn({ err: s3Err }, 'S3 upload bypassed, using direct generation');
          }
        } catch (pdfErr) {
          logger.warn({ err: pdfErr }, 'PDF generation warning during prescription creation');
        }
      }

      // 6. Insert prescription header
      const hasRxCol = await hasPrescriptionNumberColumn(client);
      let prescRes;
      if (hasRxCol) {
        prescRes = await client.query(
          `INSERT INTO prescriptions
              (patient_id, doctor_id, appointment_id, prescription_date, status, additional_notes, prescription_type, image_url, prescription_url, follow_up_days, follow_up_date, follow_up_status, prescription_number)
            VALUES ($1, $2, $3, CURRENT_DATE, 'active', $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, prescription_url, prescription_number`,
          [
            resolvedPatientId,
            resolvedDoctorId,
            input.appointmentId || null,
            input.diagnosis ?? input.generalInstructions ?? null,
            input.prescriptionType ?? 'system',
            input.imageUrl ?? null,
            finalPrescriptionUrl,
            followUpDaysNum,
            calculatedFollowUpDate,
            calculatedFollowUpDate ? 'pending' : null,
            prescriptionNumber,
          ],
        );
      } else {
        prescRes = await client.query(
          `INSERT INTO prescriptions
              (patient_id, doctor_id, appointment_id, prescription_date, status, additional_notes, prescription_type, image_url, prescription_url, follow_up_days, follow_up_date, follow_up_status)
            VALUES ($1, $2, $3, CURRENT_DATE, 'active', $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, prescription_url`,
          [
            resolvedPatientId,
            resolvedDoctorId,
            input.appointmentId || null,
            input.diagnosis ?? input.generalInstructions ?? null,
            input.prescriptionType ?? 'system',
            input.imageUrl ?? null,
            finalPrescriptionUrl,
            followUpDaysNum,
            calculatedFollowUpDate,
            calculatedFollowUpDate ? 'pending' : null,
          ],
        );
      }
      const prescriptionId: string = prescRes.rows[0].id;

      // 7. Insert medicines
      if (input.medicines && input.medicines.length > 0) {
        for (const med of input.medicines) {
          await client.query(
            `INSERT INTO prescription_medicines
                (prescription_id, medicine_id, medicine_name, strength, dosage, frequency, duration,
                 food_instruction, instructions, prescribed_quantity)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              prescriptionId,
              med.medicineId ?? null,
              med.name,
              med.strength ?? null,
              med.dosage,
              med.frequency,
              med.duration,
              med.mealTiming ?? null,
              med.instructions ?? null,
              med.prescribedQuantity ?? 1,
            ],
          );
        }
      }

      // 8. Insert lab tests
      if (input.labTests && input.labTests.length > 0) {
        for (const lab of input.labTests) {
          await client.query(
            `INSERT INTO prescription_lab_tests
                (prescription_id, patient_id, lab_test_id, test_name, instructions, lab_id)
              VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              prescriptionId,
              resolvedPatientId,
              lab.labTestId ?? null,
              lab.testName,
              lab.instructions ?? null,
              lab.labId ?? lab.lab_id ?? null,
            ],
          );
        }
      }

      // 9. Generate schedule for patient adherence
      try {
        await medicineScheduleService.generateScheduleForPrescription(prescriptionId, client);
      } catch (schedErr) {
        logger.warn({ err: schedErr }, 'Warning generating medicine schedule for prescription');
      }

      // 10. If appointmentId & markAppointmentCompleted, complete appointment
      if (input.appointmentId && input.markAppointmentCompleted !== false) {
        await client.query(
          `UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [input.appointmentId]
        );
      }

      await client.query('COMMIT');

      // 11. Patient notification
      if (resolvedPatientId) {
        try {
          void notificationService.sendToPatient(resolvedPatientId, {
            type: NotificationType.PRESCRIPTION_CREATED,
            title: 'New Prescription Available',
            body: 'Your doctor has issued a new prescription.',
            entityType: 'PRESCRIPTION',
            entityId: prescriptionId,
            route: 'Prescriptions',
            data: {
              prescriptionId,
              appointmentId: input.appointmentId || '',
              screen: 'PrescriptionDetails',
            },
          }).catch((err) => logger.warn({ err }, 'Notification dispatch failed'));
        } catch { }
      }

      const created = await this.getPrescriptionById(prescriptionId);
      if (!created) {
        throw new Error('Prescription created but failed to load');
      }
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePrescription(
    id: string,
    input: UpdatePrescriptionInput
  ): Promise<FormattedPrescription> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM prescriptions WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        throw new Error('Prescription not found');
      }
      const current = existing.rows[0];

      // Update follow up if passed
      let calculatedFollowUpDate = current.follow_up_date;
      let followUpDaysNum = current.follow_up_days;
      if (input.followUpDays !== undefined && input.followUpDays !== null && Number(input.followUpDays) > 0) {
        followUpDaysNum = Number(input.followUpDays);
        const d = new Date();
        d.setDate(d.getDate() + followUpDaysNum);
        calculatedFollowUpDate = d.toISOString().split('T')[0] ?? null;
      } else if (input.followUpDate) {
        const parsedDate = new Date(input.followUpDate);
        calculatedFollowUpDate = parsedDate.toISOString().split('T')[0] ?? null;
        const diffMs = parsedDate.getTime() - new Date().setHours(0, 0, 0, 0);
        followUpDaysNum = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      }

      const notes = input.diagnosis !== undefined ? input.diagnosis : (input.generalInstructions ?? current.additional_notes);
      const status = input.status || current.status;

      await client.query(
        `UPDATE prescriptions 
         SET additional_notes = $1, status = $2, follow_up_days = $3, follow_up_date = $4, updated_at = NOW()
         WHERE id = $5`,
        [notes, status, followUpDaysNum, calculatedFollowUpDate, id]
      );

      // Replace medicines if provided
      if (input.medicines !== undefined) {
        await client.query('DELETE FROM prescription_medicines WHERE prescription_id = $1', [id]);
        for (const med of input.medicines) {
          await client.query(
            `INSERT INTO prescription_medicines
                (prescription_id, medicine_id, medicine_name, strength, dosage, frequency, duration,
                 food_instruction, instructions, prescribed_quantity)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              id,
              med.medicineId ?? null,
              med.name,
              med.strength ?? null,
              med.dosage,
              med.frequency,
              med.duration,
              med.mealTiming ?? null,
              med.instructions ?? null,
              med.prescribedQuantity ?? 1,
            ],
          );
        }
      }

      // Replace lab tests if provided
      if (input.labTests !== undefined) {
        await client.query('DELETE FROM prescription_lab_tests WHERE prescription_id = $1', [id]);
        for (const lab of input.labTests) {
          await client.query(
            `INSERT INTO prescription_lab_tests
                (prescription_id, patient_id, lab_test_id, test_name, instructions, lab_id)
              VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              current.patient_id,
              lab.labTestId ?? null,
              lab.testName,
              lab.instructions ?? null,
              lab.labId ?? lab.lab_id ?? null,
            ],
          );
        }
      }

      // Regenerate adherence schedules
      try {
        await medicineScheduleService.generateScheduleForPrescription(id, client);
      } catch { }

      await client.query('COMMIT');

      // Send revision notification to patient
      if (current.patient_id) {
        try {
          void notificationService.sendToPatient(current.patient_id, {
            type: NotificationType.PRESCRIPTION_REVISED,
            title: 'Prescription Updated',
            body: 'Your doctor has updated your prescription.',
            entityType: 'PRESCRIPTION',
            entityId: id,
            route: 'Prescriptions',
            data: {
              prescriptionId: id,
              appointmentId: current.appointment_id || '',
              screen: 'PrescriptionDetails',
            },
          }).catch(() => { });
        } catch { }
      }

      const updated = await this.getPrescriptionById(id);
      if (!updated) throw new Error('Prescription updated but failed to load');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async generatePrescriptionHtml(id: string): Promise<string> {
    const rx = await this.getPrescriptionById(id);
    if (!rx) throw new Error('Prescription not found');

    const client = await pool.connect();
    try {
      const docRes = await client.query(
        `SELECT d.*, 
                h.name as hospital_name, h.address as hospital_address, h.phone as hospital_phone, h.email as hospital_email,
                b.name as branch_name, b.address as branch_address, b.phone as branch_phone
         FROM doctors d
         LEFT JOIN hospitals h ON d.hospital_id = h.id
         LEFT JOIN hospital_branches b ON d.branch_id = b.id
         WHERE d.id = $1`,
        [rx.doctor.id]
      );
      const docMeta = docRes.rows[0] || {};
      const prescriptionNumber = await this.generatePrescriptionNumber(
        client,
        docMeta.hospital_name,
        docMeta.branch_name
      );

      const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate();

      const dataContext = {
        hospital: {
          name: docMeta.hospital_name || 'Dr. Narendran Care Center',
          address: docMeta.hospital_address || '',
          phone: docMeta.hospital_phone || '+91 44 2829 0000',
          email: docMeta.hospital_email || '',
        },
        branch: {
          name: docMeta.branch_name || '',
          address: docMeta.branch_address || '',
          phone: docMeta.branch_phone || '',
        },
        doctor: {
          name: rx.doctor.name || docMeta.name || 'Dr. Narendran',
          qualification: docMeta.qualification || 'MBBS, MD',
          specialization: rx.doctor.specialization || docMeta.specialization || 'General Medicine',
          medical_registration_number: docMeta.medical_registration_number || '',
          phone: docMeta.phone || '',
          email: docMeta.email || '',
          clinic_address: docMeta.clinic_address || '',
        },
        patient: {
          name: rx.patient_name || 'Patient',
          patient_id: rx.patient_id ? String(rx.patient_id).slice(0, 8).toUpperCase() : '',
          phone: rx.patient_phone || '',
          gender: rx.patient_gender || '',
          date_of_birth: rx.patient_dob ? new Date(rx.patient_dob).toLocaleDateString('en-GB') : '',
          blood_pressure: rx.patient_blood_pressure || rx.vitals?.blood_pressure || '',
          blood_sugar: rx.patient_blood_sugar || rx.vitals?.blood_sugar || '',
          body_temperature: rx.patient_body_temperature || rx.vitals?.body_temperature || '',
          blood_group: rx.patient_blood_group || rx.vitals?.blood_group || '',
          height_cm: rx.patient_height_cm ?? rx.vitals?.height_cm ?? null,
          weight_kg: rx.patient_weight_kg ?? rx.vitals?.weight_kg ?? null,
          custom_vitals: rx.patient_custom_vitals ?? rx.vitals?.custom_vitals ?? [],
        },
        prescription: {
          prescription_id: rx.id ? String(rx.id).slice(0, 8).toUpperCase() : '',
          prescription_date: rx.prescription_date,
          diagnosis: rx.diagnosis || rx.additional_notes || '',
          additional_notes: rx.additional_notes || '',
          follow_up_days: rx.follow_up_days,
          follow_up_date: rx.follow_up_date,
          medicines: rx.medicines.map((m) => ({
            name: m.medicine_name,
            dosage: m.dosage,
            strength: m.strength,
            frequency: m.frequency,
            duration: m.duration,
            mealTiming: m.food_instruction,
            instructions: m.instructions,
          })),
          lab_tests: (rx.lab_tests || []).map((l) => ({
            testName: l.test_name,
            instructions: l.instructions,
            lab_id: l.lab_id,
            lab_name: l.lab_name,
            lab_phone: l.lab_phone,
            lab_address: l.lab_address,
            lab_city: l.lab_city,
            lab_map_link: l.lab_map_link,
          })),
        },
      };

      return PrescriptionTemplatesService.resolveTemplate(activeTemplate.html_content, dataContext);
    } finally {
      client.release();
    }
  }

  async generatePrescriptionPdf(id: string): Promise<{ pdfBuffer: Buffer; filename: string }> {
    const rx = await this.getPrescriptionById(id);
    if (!rx) throw new Error('Prescription not found');

    const html = await this.generatePrescriptionHtml(id);
    const pdfBuffer = await PrescriptionTemplatesService.generatePdfBuffer(html);
    const cleanPatientName = (rx.patient_name || 'patient').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Prescription_${cleanPatientName}_${rx.prescription_date}.pdf`;
    return { pdfBuffer, filename };
  }

  async getMedicinesByPrescriptionId(prescriptionId: string): Promise<PrescriptionMedicineItem[]> {
    const rx = await this.getPrescriptionById(prescriptionId);
    return rx ? rx.medicines : [];
  }

  /**
   * Returns true when the given user is authorised to view a prescription.
   *  - Doctors / admins: always allowed.
   *  - Patients: only when the prescription's patient_id resolves to their account.
   */
  async canAccessPrescription(
    userId: string,
    role: string | undefined,
    prescription: FormattedPrescription,
  ): Promise<boolean> {
    if (role && ["doctor", "admin", "superadmin"].includes(role.toLowerCase())) {
      return true;
    }
    if (!prescription.patient_id) return false;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT 1 FROM patients
          WHERE (id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1)
            AND (id::text = $2 OR user_account_id::text = $2 OR user_id::text = $2)
          LIMIT 1`,
        [prescription.patient_id, userId],
      );
      return rows.length > 0;
    } finally {
      client.release();
    }
  }
}

export const prescriptionsService = new PrescriptionsService();
