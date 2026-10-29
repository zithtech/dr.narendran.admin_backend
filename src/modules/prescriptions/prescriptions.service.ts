import { pool } from '@/db/pool.js';

import { s3Service } from '../s3/s3.service.js';

export interface PrescriptionDoctorSummary {
  id: string;
  name: string;
  specialization: string;
  specialty: string;
}

export interface PrescriptionMedicineItem {
  id: string;
  prescription_id: string;
  medicine_name: string;
  strength?: string | undefined;
  dosage?: string | undefined;
  frequency?: string | undefined;
  duration?: string | undefined;
  food_instruction?: string | undefined;
  instructions?: string | undefined;
  prescribed_quantity: number;
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
  patient_id?: string | undefined;
  prescription_date: string;
  status: "active" | "completed" | "expired" | "cancelled";
  additional_notes?: string | undefined;
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

export class PrescriptionsService {
  async getPrescriptions(filters?: { user_id?: string | undefined; patient_id?: string | undefined; status?: string | undefined; tab?: string | undefined }): Promise<FormattedPrescription[]> {
    const client = await pool.connect();
    try {
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
        whereClauses.push("(p.patient_id::text = $" + paramIdx + " OR p.patient_id::text = $" + (paramIdx + 1) + ")");
        params.push(targetPatientId, targetUserId);
        paramIdx += 2;
      } else {
        return [];
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

      const whereClause = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

      const query = `
        SELECT 
          p.id,
          p.patient_id,
          p.prescription_date,
          p.status,
          p.additional_notes,
          p.created_at,
          p.image_url,
          p.prescription_type,
          p.prescription_url,
          d.id as doctor_id,
          d.name as doctor_name,
          COALESCE(NULLIF(d.specialization, ''), 'General Medicine') as doctor_specialty
        FROM prescriptions p
        LEFT JOIN doctors d ON p.doctor_id = d.id
        ${whereClause}
        ORDER BY p.prescription_date DESC, p.created_at DESC
      `;

      const { rows } = await client.query(query, params);
      if (rows.length === 0) return [];

      const rxIds = rows.map((r: any) => r.id);

      const medRes = await client.query(`
        SELECT * FROM prescription_medicines 
        WHERE prescription_id = ANY($1::uuid[])
        ORDER BY created_at ASC
      `, [rxIds]);

      const medMap = new Map<string, PrescriptionMedicineItem[]>();
      for (const m of medRes.rows) {
        if (!medMap.has(m.prescription_id)) {
          medMap.set(m.prescription_id, []);
        }
        medMap.get(m.prescription_id)!.push({
          id: m.id,
          prescription_id: m.prescription_id,
          medicine_name: m.medicine_name,
          strength: m.strength || undefined,
          dosage: m.dosage || undefined,
          frequency: m.frequency || undefined,
          duration: m.duration || undefined,
          food_instruction: m.food_instruction || undefined,
          instructions: m.instructions || undefined,
          prescribed_quantity: parseInt(m.prescribed_quantity, 10) || 1,
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
          : (r.prescription_date ? r.prescription_date.toISOString().split("T")[0] : "2026-09-28");
        const signedImageUrl = await signPrescriptionImageUrl(r.image_url);
        const signedPrescriptionUrl = await signPrescriptionImageUrl(r.prescription_url);
        result.push({
          id: r.id,
          patient_id: r.patient_id || undefined,
          prescription_date: dateStr,
          status: (r.status || "active").toLowerCase(),
          additional_notes: r.additional_notes || undefined,
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
      const { rows } = await client.query(`
        SELECT 
          p.id,
          p.patient_id,
          p.prescription_date,
          p.status,
          p.additional_notes,
          p.created_at,
          p.image_url,
          p.prescription_type,
          p.prescription_url,
          d.id as doctor_id,
          d.name as doctor_name,
          COALESCE(NULLIF(d.specialization, ''), 'General Medicine') as doctor_specialty
        FROM prescriptions p
        LEFT JOIN doctors d ON p.doctor_id = d.id
        WHERE p.id = $1
      `, [id]);

      if (rows.length === 0) return null;
      const r = rows[0];

      const medRes = await client.query(`
        SELECT * FROM prescription_medicines 
        WHERE prescription_id = $1
        ORDER BY created_at ASC
      `, [id]);

      const meds: PrescriptionMedicineItem[] = medRes.rows.map((m: any) => ({
        id: m.id,
        prescription_id: m.prescription_id,
        medicine_name: m.medicine_name,
        strength: m.strength || undefined,
        dosage: m.dosage || undefined,
        frequency: m.frequency || undefined,
        duration: m.duration || undefined,
        food_instruction: m.food_instruction || undefined,
        instructions: m.instructions || undefined,
        prescribed_quantity: parseInt(m.prescribed_quantity, 10) || 1,
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
        : (r.prescription_date ? r.prescription_date.toISOString().split("T")[0] : "2026-09-28");

      const signedImageUrl = await signPrescriptionImageUrl(r.image_url);
      const signedPrescriptionUrl = await signPrescriptionImageUrl(r.prescription_url);

      return {
        id: r.id,
        patient_id: r.patient_id || undefined,
        prescription_date: dateStr,
        status: (r.status || "active").toLowerCase(),
        additional_notes: r.additional_notes || undefined,
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
      };
    } finally {
      client.release();
    }
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
