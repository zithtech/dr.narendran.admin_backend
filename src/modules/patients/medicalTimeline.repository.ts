import { pool } from '@/db/pool.js';
import { query, queryOne } from '@/db/query.js';

export interface RawPatientRow {
  id: string;
  userAccountId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  basicMedicalInfo: unknown;
  emergencyContacts: unknown;
  profileImageUrl: string | null;
  createdAt: string;
}

export interface RawAppointmentRow {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string | null;
  doctorSpecialization: string | null;
  scheduledStart: string | Date;
  scheduledEnd: string | Date;
  status: string;
  purpose: string | null;
  visitReason: string | null;
  rescheduleReason: string | null;
  cancellationReason: string | null;
  consultationNotes: string | null;
  diagnosis: string | null;
  vitals: unknown;
  createdAt: string | Date;
}

export interface RawPrescriptionRow {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string | null;
  doctorSpecialization: string | null;
  appointmentId: string | null;
  prescriptionDate: string | Date;
  status: string;
  additionalNotes: string | null;
  prescriptionType: string | null;
  imageUrl: string | null;
  prescriptionUrl: string | null;
  createdAt: string | Date;
}

export interface RawPrescriptionMedicineRow {
  id: string;
  prescriptionId: string;
  medicineId: string | null;
  medicineName: string;
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  foodInstruction: string | null;
  instructions: string | null;
  prescribedQuantity: number;
  createdAt: string | Date;
}

export interface RawPrescriptionLabTestRow {
  id: string;
  prescriptionId: string;
  labTestId: string | null;
  testName: string;
  instructions: string | null;
  orderedDate: string | Date;
  doctorId: string | null;
  doctorName: string | null;
  doctorSpecialization: string | null;
  createdAt: string | Date;
}

export interface RawLabReportRow {
  id: string;
  prescriptionLabTestId: string | null;
  patientId: string;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  reportDate: string | Date;
  documentUrl: string;
  storageKey: string | null;
  notes: string | null;
  isExternal: boolean;
  testName: string | null;
  createdAt: string | Date;
}

export interface RawMedicineScheduleRow {
  id: string;
  prescriptionId: string | null;
  medicineName: string;
  scheduledDate: string | Date;
  scheduledTime: string | null;
  doseTimeOfDay: string | null;
  status: string;
  takenAt: string | Date | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves all potential patient IDs associated with a user.
 */
export async function getPatientResolvedIds(
  userId: string,
): Promise<{ primaryId: string; allIds: string[] }> {
  const idSet = new Set<string>();
  if (UUID_REGEX.test(userId)) idSet.add(userId);

  try {
    const patient = await queryOne<{
      id: string;
      user_account_id: string | null;
    }>(
      `SELECT id, user_account_id
       FROM patients
       WHERE id::text = $1 OR user_account_id::text = $1
       LIMIT 1`,
      [userId],
    );

    if (patient?.id) idSet.add(patient.id);
    if (patient?.user_account_id) idSet.add(patient.user_account_id);

    const allIds = Array.from(idSet).filter((id) => UUID_REGEX.test(id));
    const primaryId = patient?.id || userId;
    return { primaryId, allIds: allIds.length > 0 ? allIds : [userId] };
  } catch (err) {
    console.error('getPatientResolvedIds error:', err);
    const allIds = Array.from(idSet).filter((id) => UUID_REGEX.test(id));
    return { primaryId: userId, allIds: allIds.length > 0 ? allIds : [userId] };
  }
}

/**
 * Fetch patient profile details.
 */
export async function getPatientProfile(
  allIds: string[],
): Promise<RawPatientRow | null> {
  if (allIds.length === 0) return null;

  try {
    const sql = `
      SELECT
        p.id,
        p.user_account_id          AS "userAccountId",
        COALESCE(p.name, u.username, 'Patient') AS "name",
        COALESCE(p.phone, u.username) AS "phone",
        COALESCE(p.email, u.username) AS "email",
        p.date_of_birth::text      AS "dateOfBirth",
        p.gender                   AS "gender",
        p.height_cm                AS "heightCm",
        p.weight_kg                AS "weightKg",
        p.blood_group              AS "bloodGroup",
        p.marital_status           AS "maritalStatus",
        p.basic_medical_info       AS "basicMedicalInfo",
        p.emergency_contacts       AS "emergencyContacts",
        p.profile_image_url        AS "profileImageUrl",
        p.created_at::text         AS "createdAt"
      FROM patients p
      LEFT JOIN user_accounts u ON p.user_account_id = u.id
      WHERE p.id = ANY($1::uuid[]) OR p.user_account_id = ANY($1::uuid[])
      ORDER BY p.created_at DESC
      LIMIT 1
    `;

    return await queryOne<RawPatientRow>(sql, [allIds]);
  } catch (err) {
    console.error('getPatientProfile error:', err);
    return null;
  }
}

/**
 * Fetch all appointments for the patient.
 */
export async function getPatientAppointments(
  allIds: string[],
): Promise<RawAppointmentRow[]> {
  if (allIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        a.id,
        a.patient_id               AS "patientId",
        a.doctor_id                AS "doctorId",
        d.name                     AS "doctorName",
        COALESCE(NULLIF(d.specialization, ''), 'General Medicine') AS "doctorSpecialization",
        a.scheduled_start          AS "scheduledStart",
        a.scheduled_end            AS "scheduledEnd",
        a.status                   AS "status",
        a.purpose                  AS "purpose",
        a.visit_reason             AS "visitReason",
        a.reschedule_reason        AS "rescheduleReason",
        a.cancellation_reason      AS "cancellationReason",
        a.consultation_notes       AS "consultationNotes",
        NULL::text                 AS "diagnosis",
        NULL::jsonb                AS "vitals",
        a.created_at               AS "createdAt"
      FROM appointments a
      LEFT JOIN doctors d ON (a.doctor_id = d.id OR a.doctor_id = d.user_account_id)
      WHERE a.patient_id = ANY($1::uuid[])
      ORDER BY a.scheduled_start DESC, a.created_at DESC
    `;

    return await query<RawAppointmentRow>(sql, [allIds]);
  } catch (err) {
    console.error('getPatientAppointments error:', err);
    return [];
  }
}

/**
 * Fetch all prescriptions for the patient.
 */
export async function getPatientPrescriptions(
  allIds: string[],
): Promise<RawPrescriptionRow[]> {
  if (allIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        p.id,
        p.patient_id               AS "patientId",
        p.doctor_id                AS "doctorId",
        d.name                     AS "doctorName",
        COALESCE(NULLIF(d.specialization, ''), 'General Medicine') AS "doctorSpecialization",
        p.appointment_id           AS "appointmentId",
        p.prescription_date        AS "prescriptionDate",
        p.status                   AS "status",
        p.additional_notes         AS "additionalNotes",
        p.prescription_type        AS "prescriptionType",
        p.image_url                AS "imageUrl",
        p.prescription_url         AS "prescriptionUrl",
        p.created_at               AS "createdAt"
      FROM prescriptions p
      LEFT JOIN doctors d ON (p.doctor_id = d.id OR p.doctor_id = d.user_account_id)
      WHERE p.patient_id = ANY($1::uuid[])
      ORDER BY p.prescription_date DESC, p.created_at DESC
    `;

    return await query<RawPrescriptionRow>(sql, [allIds]);
  } catch (err) {
    console.error('getPatientPrescriptions error:', err);
    return [];
  }
}

/**
 * Fetch medicines for prescription IDs.
 */
export async function getPrescriptionMedicines(
  prescriptionIds: string[],
): Promise<RawPrescriptionMedicineRow[]> {
  if (prescriptionIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        pm.id,
        pm.prescription_id         AS "prescriptionId",
        pm.medicine_id             AS "medicineId",
        pm.medicine_name           AS "medicineName",
        pm.strength                AS "strength",
        pm.dosage                  AS "dosage",
        pm.frequency               AS "frequency",
        pm.duration                AS "duration",
        pm.food_instruction        AS "foodInstruction",
        pm.instructions            AS "instructions",
        COALESCE(pm.prescribed_quantity, 1) AS "prescribedQuantity",
        pm.created_at              AS "createdAt"
      FROM prescription_medicines pm
      WHERE pm.prescription_id = ANY($1::uuid[])
      ORDER BY pm.created_at ASC
    `;

    return await query<RawPrescriptionMedicineRow>(sql, [prescriptionIds]);
  } catch (err) {
    console.error('getPrescriptionMedicines error:', err);
    return [];
  }
}

/**
 * Fetch prescribed lab tests for prescription IDs or patient IDs.
 */
export async function getPrescriptionLabTests(
  prescriptionIds: string[],
  allPatientIds: string[],
): Promise<RawPrescriptionLabTestRow[]> {
  if (prescriptionIds.length === 0 && allPatientIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        plt.id,
        plt.prescription_id        AS "prescriptionId",
        plt.lab_test_id            AS "labTestId",
        plt.test_name              AS "testName",
        plt.instructions           AS "instructions",
        COALESCE(p.prescription_date, plt.created_at) AS "orderedDate",
        d.id                       AS "doctorId",
        d.name                     AS "doctorName",
        COALESCE(NULLIF(d.specialization, ''), 'General Medicine') AS "doctorSpecialization",
        plt.created_at             AS "createdAt"
      FROM prescription_lab_tests plt
      LEFT JOIN prescriptions p ON plt.prescription_id = p.id
      LEFT JOIN doctors d ON (p.doctor_id = d.id OR p.doctor_id = d.user_account_id)
      WHERE (plt.prescription_id = ANY($1::uuid[]))
         OR (plt.patient_id = ANY($2::uuid[]))
      ORDER BY plt.created_at DESC
    `;

    return await query<RawPrescriptionLabTestRow>(sql, [
      prescriptionIds,
      allPatientIds,
    ]);
  } catch (err) {
    console.error('getPrescriptionLabTests error:', err);
    return [];
  }
}

/**
 * Fetch all lab test reports for the patient.
 */
export async function getPatientLabReports(
  allIds: string[],
): Promise<RawLabReportRow[]> {
  if (allIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        lr.id,
        lr.prescription_lab_test_id AS "prescriptionLabTestId",
        lr.patient_id               AS "patientId",
        lr.file_name                AS "fileName",
        lr.file_type                AS "fileType",
        lr.file_size                AS "fileSize",
        lr.report_date              AS "reportDate",
        lr.document_url             AS "documentUrl",
        lr.storage_key              AS "storageKey",
        lr.notes                    AS "notes",
        lr.is_external              AS "isExternal",
        lr.test_name                AS "testName",
        lr.created_at               AS "createdAt"
      FROM lab_test_reports lr
      WHERE lr.patient_id = ANY($1::uuid[])
      ORDER BY lr.report_date DESC, lr.created_at DESC
    `;

    return await query<RawLabReportRow>(sql, [allIds]);
  } catch (err) {
    console.error('getPatientLabReports error:', err);
    return [];
  }
}

/**
 * Fetch medicine schedule records for adherence calculation.
 */
export async function getPatientMedicineSchedules(
  allIds: string[],
): Promise<RawMedicineScheduleRow[]> {
  if (allIds.length === 0) return [];

  try {
    const sql = `
      SELECT
        id,
        prescription_id            AS "prescriptionId",
        medicine_name              AS "medicineName",
        scheduled_date             AS "scheduledDate",
        scheduled_time             AS "scheduledTime",
        NULL::text                 AS "doseTimeOfDay",
        status,
        taken_at                   AS "takenAt"
      FROM medicine_schedules
      WHERE patient_id = ANY($1::uuid[])
      ORDER BY scheduled_date DESC
    `;

    return await query<RawMedicineScheduleRow>(sql, [allIds]);
  } catch (err) {
    console.error('getPatientMedicineSchedules error:', err);
    return [];
  }
}
