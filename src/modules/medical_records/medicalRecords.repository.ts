import { pool } from '@/db/pool.js';
import type {
  ListMedicalRecordsQuery,
  UpdateMedicalRecordBody,
} from './medicalRecords.schema.js';
import type {
  DuplicateCheckResult,
  MedicalRecord,
  PatientDossier,
  PrescribedPendingTest,
} from './medicalRecords.types.js';

function formatDateOnly(val: string | Date | null | undefined): string {
  if (!val) return '';
  const str = String(val);
  return str.split('T')[0] ?? '';
}

function formatDateOnlyOrNull(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  const str = String(val);
  return str.split('T')[0] ?? null;
}

export class MedicalRecordsRepository {
  async listRecords(options: ListMedicalRecordsQuery): Promise<{
    records: MedicalRecord[];
    total: number;
  }> {
    const {
      page,
      limit,
      search,
      patientId,
      type,
      uploadedBy,
      fromDate,
      toDate,
    } = options;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (patientId) {
      conditions.push(`lr.patient_id = $${paramIndex++}`);
      params.push(patientId);
    }

    if (type) {
      const upperType = type.toUpperCase();
      if (upperType === 'PRESCRIBED') {
        conditions.push(`lr.is_external = false`);
      } else if (upperType === 'EXTERNAL') {
        conditions.push(`lr.is_external = true`);
      }
    }

    if (uploadedBy && uploadedBy.trim() && uploadedBy.toUpperCase() !== 'ALL') {
      const up = uploadedBy.trim().toUpperCase();
      conditions.push(`(
        lr.uploaded_by::text = $${paramIndex}
        OR (au.id IS NOT NULL AND $${paramIndex} = 'ADMIN')
        OR (u.role = 'doctor' AND $${paramIndex} = 'DOCTOR')
      )`);
      params.push(up);
      paramIndex++;
    }

    if (fromDate) {
      conditions.push(`lr.report_date >= $${paramIndex++}::date`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`lr.report_date <= $${paramIndex++}::date`);
      params.push(toDate);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(
        lr.test_name ILIKE $${paramIndex}
        OR lr.file_name ILIKE $${paramIndex}
        OR pt.name ILIKE $${paramIndex}
        OR pt.phone ILIKE $${paramIndex}
        OR pt.email ILIKE $${paramIndex}
      )`);
      params.push(term);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM lab_test_reports lr
      JOIN patients pt ON pt.id = lr.patient_id
      LEFT JOIN prescription_lab_tests plt ON plt.id = lr.prescription_lab_test_id
      LEFT JOIN prescriptions p ON p.id = plt.prescription_id
      LEFT JOIN users u ON u.id = lr.uploaded_by_id
      LEFT JOIN admin_users au ON au.id = lr.uploaded_by_id
      ${whereClause}
    `;

    const countRes = await pool.query(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    const dataSql = `
      SELECT 
        lr.id,
        lr.prescription_lab_test_id,
        lr.patient_id,
        pt.name as patient_name,
        pt.phone as patient_phone,
        pt.email as patient_email,
        lr.file_name,
        lr.file_type,
        lr.file_size,
        lr.report_date,
        lr.document_url,
        lr.storage_key,
        lr.notes,
        CASE
          WHEN lr.uploaded_by::text = 'ADMIN' THEN 'ADMIN'
          WHEN lr.uploaded_by::text = 'DOCTOR' THEN 'DOCTOR'
          WHEN au.id IS NOT NULL THEN 'ADMIN'
          WHEN u.role = 'doctor' THEN 'DOCTOR'
          WHEN lr.uploaded_by::text = 'LAB' THEN 'LAB'
          ELSE lr.uploaded_by::text
        END as uploaded_by,
        lr.uploaded_by_id,
        COALESCE(au.name, u.full_name, lpu.username, pt.name, 'Admin') as uploader_name,
        lr.is_external,
        COALESCE(lr.test_name, plt.test_name, lr.file_name) as test_name,
        plt.prescription_id,
        p.prescription_date,
        COALESCE(d.name, 'Dr. Narendran') as doctor_name,
        lr.created_at,
        lr.updated_at
      FROM lab_test_reports lr
      JOIN patients pt ON pt.id = lr.patient_id
      LEFT JOIN prescription_lab_tests plt ON plt.id = lr.prescription_lab_test_id
      LEFT JOIN prescriptions p ON p.id = plt.prescription_id
      LEFT JOIN doctors d ON d.id = p.doctor_id
      LEFT JOIN users u ON u.id = lr.uploaded_by_id
      LEFT JOIN admin_users au ON au.id = lr.uploaded_by_id
      LEFT JOIN lab_portal_users lpu ON lpu.id = lr.uploaded_by_id
      ${whereClause}
      ORDER BY lr.report_date DESC, lr.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataRes = await pool.query(dataSql, [...params, limit, offset]);

    const records: MedicalRecord[] = dataRes.rows.map((row) => ({
      id: row.id,
      prescriptionLabTestId: row.prescription_lab_test_id,
      patientId: row.patient_id,
      patientName: row.patient_name || 'Unknown Patient',
      patientPhone: row.patient_phone || null,
      patientEmail: row.patient_email || null,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: Number(row.file_size || 0),
      reportDate: formatDateOnly(row.report_date),
      documentUrl: row.document_url,
      storageKey: row.storage_key,
      notes: row.notes,
      uploadedBy: row.uploaded_by,
      uploadedById: row.uploaded_by_id,
      uploaderName: row.uploader_name || 'Staff',
      isExternal: Boolean(row.is_external),
      testName: row.test_name,
      prescriptionId: row.prescription_id || null,
      prescriptionDate: formatDateOnlyOrNull(row.prescription_date),
      doctorName: row.doctor_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { records, total };
  }

  async getRecordById(id: string): Promise<MedicalRecord | null> {
    const sql = `
      SELECT 
        lr.id,
        lr.prescription_lab_test_id,
        lr.patient_id,
        pt.name as patient_name,
        pt.phone as patient_phone,
        pt.email as patient_email,
        lr.file_name,
        lr.file_type,
        lr.file_size,
        lr.report_date,
        lr.document_url,
        lr.storage_key,
        lr.notes,
        CASE
          WHEN lr.uploaded_by::text = 'ADMIN' THEN 'ADMIN'
          WHEN lr.uploaded_by::text = 'DOCTOR' THEN 'DOCTOR'
          WHEN au.id IS NOT NULL THEN 'ADMIN'
          WHEN u.role = 'doctor' THEN 'DOCTOR'
          WHEN lr.uploaded_by::text = 'LAB' THEN 'LAB'
          ELSE lr.uploaded_by::text
        END as uploaded_by,
        lr.uploaded_by_id,
        COALESCE(au.name, u.full_name, lpu.username, pt.name, 'Admin') as uploader_name,
        lr.is_external,
        COALESCE(lr.test_name, plt.test_name, lr.file_name) as test_name,
        plt.prescription_id,
        p.prescription_date,
        COALESCE(d.name, 'Dr. Narendran') as doctor_name,
        lr.created_at,
        lr.updated_at
      FROM lab_test_reports lr
      JOIN patients pt ON pt.id = lr.patient_id
      LEFT JOIN prescription_lab_tests plt ON plt.id = lr.prescription_lab_test_id
      LEFT JOIN prescriptions p ON p.id = plt.prescription_id
      LEFT JOIN doctors d ON d.id = p.doctor_id
      LEFT JOIN users u ON u.id = lr.uploaded_by_id
      LEFT JOIN admin_users au ON au.id = lr.uploaded_by_id
      LEFT JOIN lab_portal_users lpu ON lpu.id = lr.uploaded_by_id
      WHERE lr.id::text = $1
      LIMIT 1
    `;

    const res = await pool.query(sql, [id]);
    const row = res.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      prescriptionLabTestId: row.prescription_lab_test_id,
      patientId: row.patient_id,
      patientName: row.patient_name || 'Unknown Patient',
      patientPhone: row.patient_phone || null,
      patientEmail: row.patient_email || null,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: Number(row.file_size || 0),
      reportDate: formatDateOnly(row.report_date),
      documentUrl: row.document_url,
      storageKey: row.storage_key,
      notes: row.notes,
      uploadedBy: row.uploaded_by,
      uploadedById: row.uploaded_by_id,
      uploaderName: row.uploader_name || 'Staff',
      isExternal: Boolean(row.is_external),
      testName: row.test_name,
      prescriptionId: row.prescription_id || null,
      prescriptionDate: formatDateOnlyOrNull(row.prescription_date),
      doctorName: row.doctor_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getPatientDossier(patientId: string): Promise<PatientDossier | null> {
    // 1. Get patient info
    const patientSql = `
      SELECT 
        id,
        name,
        phone,
        email,
        date_of_birth,
        gender,
        blood_group,
        address,
        profile_image_url
      FROM patients
      WHERE id::text = $1
      LIMIT 1
    `;
    const patientRes = await pool.query(patientSql, [patientId]);
    const pRow = patientRes.rows[0];
    if (!pRow) return null;

    // 2. Fetch all prescribed lab tests for this patient
    const testsSql = `
      SELECT 
        plt.id,
        plt.prescription_id,
        plt.patient_id,
        plt.lab_test_id,
        plt.test_name,
        plt.instructions,
        plt.created_at,
        p.prescription_date,
        COALESCE(d.name, 'Dr. Narendran') as doctor_name,
        d.specialization as doctor_specialization,
        (SELECT COUNT(*)::int FROM lab_test_reports r WHERE r.prescription_lab_test_id = plt.id) as reports_count
      FROM prescription_lab_tests plt
      JOIN prescriptions p ON p.id = plt.prescription_id
      LEFT JOIN doctors d ON d.id = p.doctor_id
      WHERE plt.patient_id::text = $1 OR p.patient_id::text = $1
      ORDER BY plt.created_at DESC
    `;
    const testsRes = await pool.query(testsSql, [patientId]);

    const pendingPrescribedTests: PrescribedPendingTest[] = testsRes.rows.map((row) => ({
      id: row.id,
      prescriptionId: row.prescription_id,
      patientId: row.patient_id || patientId,
      labTestId: row.lab_test_id,
      testName: row.test_name,
      instructions: row.instructions,
      prescriptionDate: formatDateOnlyOrNull(row.prescription_date),
      doctorName: row.doctor_name,
      doctorSpecialization: row.doctor_specialization,
      status: Number(row.reports_count || 0) > 0 ? 'Uploaded' : 'Pending',
      reportsCount: Number(row.reports_count || 0),
      createdAt: row.created_at,
    }));

    // 3. Fetch all uploaded records for this patient
    const { records } = await this.listRecords({
      patientId,
      page: 1,
      limit: 100,
      type: 'ALL',
    });

    return {
      patient: {
        id: pRow.id,
        name: pRow.name,
        phone: pRow.phone || null,
        email: pRow.email || null,
        dateOfBirth: formatDateOnlyOrNull(pRow.date_of_birth),
        gender: pRow.gender || null,
        bloodGroup: pRow.blood_group || null,
        address: pRow.address || null,
        profileImageUrl: pRow.profile_image_url || null,
      },
      pendingPrescribedTests,
      records,
    };
  }

  async insertRecord(params: {
    patientId: string;
    prescriptionLabTestId?: string | null;
    fileName: string;
    fileType: string;
    fileSize: number;
    reportDate: string;
    documentUrl: string;
    storageKey: string;
    notes?: string | null;
    uploadedById: string;
    uploaderRole: string;
    isExternal: boolean;
    testName: string;
  }): Promise<MedicalRecord> {
    const {
      patientId,
      prescriptionLabTestId,
      fileName,
      fileType,
      fileSize,
      reportDate,
      documentUrl,
      storageKey,
      notes,
      uploadedById,
      uploaderRole,
      isExternal,
      testName,
    } = params;

    const roleEnumVal = uploaderRole.toUpperCase() === 'DOCTOR' ? 'DOCTOR' : 'ADMIN';

    // Attempt insert with the role enum value; fallback to 'PATIENT' if enum type does not yet include ADMIN/DOCTOR
    let insertedRow: any;
    try {
      const sql = `
        INSERT INTO lab_test_reports (
          patient_id,
          prescription_lab_test_id,
          file_name,
          file_type,
          file_size,
          report_date,
          document_url,
          storage_key,
          notes,
          uploaded_by_id,
          uploaded_by,
          is_external,
          test_name
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *
      `;
      const res = await pool.query(sql, [
        patientId,
        prescriptionLabTestId || null,
        fileName,
        fileType,
        fileSize,
        reportDate,
        documentUrl,
        storageKey,
        notes || null,
        uploadedById,
        roleEnumVal,
        isExternal,
        testName,
      ]);
      insertedRow = res.rows[0];
    } catch (err: any) {
      // If error is invalid enum value for lab_report_uploaded_by_enum, fallback to 'PATIENT'
      if (err?.code === '22P02' || String(err?.message || '').includes('lab_report_uploaded_by_enum')) {
        const fallbackSql = `
          INSERT INTO lab_test_reports (
            patient_id,
            prescription_lab_test_id,
            file_name,
            file_type,
            file_size,
            report_date,
            document_url,
            storage_key,
            notes,
            uploaded_by_id,
            uploaded_by,
            is_external,
            test_name
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PATIENT', $11, $12
          ) RETURNING *
        `;
        const res = await pool.query(fallbackSql, [
          patientId,
          prescriptionLabTestId || null,
          fileName,
          fileType,
          fileSize,
          reportDate,
          documentUrl,
          storageKey,
          notes || null,
          uploadedById,
          isExternal,
          testName,
        ]);
        insertedRow = res.rows[0];
      } else {
        throw err;
      }
    }

    const fullRecord = await this.getRecordById(insertedRow.id);
    if (!fullRecord) {
      throw new Error('Failed to retrieve newly created record.');
    }
    return fullRecord;
  }

  async updateRecord(id: string, updates: UpdateMedicalRecordBody): Promise<MedicalRecord | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (updates.testName !== undefined) {
      fields.push(`test_name = $${pIdx++}`);
      params.push(updates.testName);
    }
    if (updates.reportDate !== undefined) {
      fields.push(`report_date = $${pIdx++}::date`);
      params.push(updates.reportDate);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${pIdx++}`);
      params.push(updates.notes || null);
    }

    if (fields.length === 0) {
      return this.getRecordById(id);
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE lab_test_reports
      SET ${fields.join(', ')}
      WHERE id::text = $${pIdx}
      RETURNING id
    `;

    const res = await pool.query(sql, params);
    if (res.rowCount === 0) return null;

    return this.getRecordById(id);
  }

  async checkDuplicateRecord(params: {
    patientId: string;
    fileName: string;
    fileSize?: number | null;
    testName?: string | null;
    reportDate?: string | null;
    prescriptionLabTestId?: string | null;
  }): Promise<DuplicateCheckResult> {
    const { patientId, fileName, fileSize, testName, reportDate, prescriptionLabTestId } = params;

    // 1. If linked to prescriptionLabTestId, check if already uploaded
    if (prescriptionLabTestId) {
      const sql = `
        SELECT id, test_name AS "testName", file_name AS "fileName", report_date AS "reportDate", file_size AS "fileSize", uploaded_by AS "uploadedBy", created_at AS "createdAt"
        FROM lab_test_reports
        WHERE prescription_lab_test_id::text = $1
        LIMIT 1
      `;
      const res = await pool.query(sql, [prescriptionLabTestId]);
      if (res.rows.length > 0) {
        return { isDuplicate: true, existingRecord: res.rows[0] };
      }
    }

    // 2. Check by identical fileName and fileSize for the same patient
    if (fileSize && fileSize > 0) {
      const sql = `
        SELECT id, test_name AS "testName", file_name AS "fileName", report_date AS "reportDate", file_size AS "fileSize", uploaded_by AS "uploadedBy", created_at AS "createdAt"
        FROM lab_test_reports
        WHERE patient_id::text = $1
          AND LOWER(TRIM(file_name)) = LOWER(TRIM($2))
          AND file_size = $3
        LIMIT 1
      `;
      const res = await pool.query(sql, [patientId, fileName, fileSize]);
      if (res.rows.length > 0) {
        return { isDuplicate: true, existingRecord: res.rows[0] };
      }
    }

    // 3. Check by testName and reportDate and fileSize
    if (testName && reportDate && fileSize && fileSize > 0) {
      const sql = `
        SELECT id, test_name AS "testName", file_name AS "fileName", report_date AS "reportDate", file_size AS "fileSize", uploaded_by AS "uploadedBy", created_at AS "createdAt"
        FROM lab_test_reports
        WHERE patient_id::text = $1
          AND LOWER(TRIM(test_name)) = LOWER(TRIM($2))
          AND report_date = $3::date
          AND file_size = $4
        LIMIT 1
      `;
      const res = await pool.query(sql, [patientId, testName, reportDate, fileSize]);
      if (res.rows.length > 0) {
        return { isDuplicate: true, existingRecord: res.rows[0] };
      }
    }

    return { isDuplicate: false };
  }

  async deleteRecord(id: string): Promise<{ id: string; storageKey: string | null } | null> {
    const sql = `
      DELETE FROM lab_test_reports
      WHERE id::text = $1
      RETURNING id, storage_key
    `;
    const res = await pool.query(sql, [id]);
    if (res.rowCount === 0) return null;
    return {
      id: res.rows[0].id,
      storageKey: res.rows[0].storage_key || null,
    };
  }
}

export const medicalRecordsRepository = new MedicalRecordsRepository();
