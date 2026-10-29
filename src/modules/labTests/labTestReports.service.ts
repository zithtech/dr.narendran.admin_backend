import { query, queryOne } from '@/db/query.js';
import { ForbiddenError, NotFoundError, ValidationError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';

export interface PrescribedLabTestReport {
  id: string;
  prescriptionLabTestId: string | null;
  patientId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  reportDate: string;
  documentUrl: string;
  storageKey: string | null;
  notes: string | null;
  uploadedBy: string;
  isExternal: boolean;
  testName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientPrescribedLabTest {
  id: string;
  prescriptionId: string;
  patientId: string;
  labTestId: string | null;
  testName: string;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
  prescriptionDate: string | null;
  doctorId: string | null;
  doctorName: string | null;
  doctorSpecialization: string | null;
  reports: PrescribedLabTestReport[];
  status: 'Uploaded' | 'Not Uploaded';
  isExternal?: boolean;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateOnly(val: string | Date | null | undefined): string {
  if (!val) return '';
  const str = String(val);
  const parts = str.split('T');
  return parts[0] ?? '';
}

function formatDateOnlyOrNull(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  const str = String(val);
  const parts = str.split('T');
  return parts[0] ?? null;
}

export async function resolvePatientAllIds(userId: string): Promise<{ primaryId: string; allIds: string[] }> {
  const patient = await queryOne<{ id: string; user_account_id: string | null; user_id: string | null }>(
    `SELECT id, user_account_id, user_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1 LIMIT 1`,
    [userId]
  );

  const idSet = new Set<string>();
  if (patient?.id) idSet.add(patient.id);
  if (patient?.user_account_id) idSet.add(patient.user_account_id);
  if (patient?.user_id) idSet.add(patient.user_id);
  idSet.add(userId);

  const allIds = Array.from(idSet).filter(id => UUID_REGEX.test(id));
  const primaryId = patient?.id || userId;
  return { primaryId, allIds };
}

export async function resolvePatientId(userId: string): Promise<string> {
  const { primaryId } = await resolvePatientAllIds(userId);
  return primaryId;
}

export async function signDocumentUrl(storageKey: string | null, fallbackUrl: string): Promise<string> {
  if (!storageKey) return fallbackUrl;
  try {
    return await s3Service.getReadUrl(decodeURIComponent(storageKey), 86400);
  } catch {
    return fallbackUrl;
  }
}

export async function getPatientPrescribedLabTests(userId: string): Promise<PatientPrescribedLabTest[]> {
  const { primaryId, allIds } = await resolvePatientAllIds(userId);

  // Fetch all prescribed lab tests for this patient with prescription & doctor details
  const testsSql = `
    SELECT 
      plt.id,
      plt.prescription_id,
      plt.patient_id,
      plt.lab_test_id,
      plt.test_name,
      plt.instructions,
      plt.created_at,
      plt.updated_at,
      p.prescription_date,
      p.doctor_id,
      COALESCE(d.name, 'Dr. Narendran') as doctor_name,
      d.specialization as doctor_specialization
    FROM prescription_lab_tests plt
    JOIN prescriptions p ON p.id = plt.prescription_id
    LEFT JOIN doctors d ON d.id = p.doctor_id
    WHERE plt.patient_id = ANY($1::uuid[]) OR p.patient_id = ANY($1::uuid[])
    ORDER BY plt.created_at DESC
  `;

  const testsRows = await query<any>(testsSql, [allIds]);

  // Fetch all lab_test_reports for this patient
  const reportsSql = `
    SELECT 
      id,
      prescription_lab_test_id,
      patient_id,
      file_name,
      file_type,
      file_size,
      report_date,
      document_url,
      storage_key,
      notes,
      uploaded_by,
      uploaded_by_id,
      is_external,
      test_name,
      created_at,
      updated_at
    FROM lab_test_reports
    WHERE patient_id = ANY($1::uuid[]) OR uploaded_by_id = $2::uuid
    ORDER BY created_at DESC
  `;

  const reportsRows = await query<any>(reportsSql, [allIds, userId]);

  // Map reports by prescription_lab_test_id
  const reportsByPltId = new Map<string, PrescribedLabTestReport[]>();
  const externalReports: PrescribedLabTestReport[] = [];

  for (const row of reportsRows) {
    const signedUrl = await signDocumentUrl(row.storage_key, row.document_url);
    const rep: PrescribedLabTestReport = {
      id: row.id,
      prescriptionLabTestId: row.prescription_lab_test_id,
      patientId: row.patient_id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: Number(row.file_size || 0),
      reportDate: formatDateOnly(row.report_date),
      documentUrl: signedUrl,
      storageKey: row.storage_key,
      notes: row.notes,
      uploadedBy: row.uploaded_by,
      isExternal: Boolean(row.is_external),
      testName: row.test_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (row.prescription_lab_test_id) {
      const list = reportsByPltId.get(row.prescription_lab_test_id) || [];
      list.push(rep);
      reportsByPltId.set(row.prescription_lab_test_id, list);
    } else if (row.is_external) {
      externalReports.push(rep);
    }
  }

  const result: PatientPrescribedLabTest[] = testsRows.map((row) => {
    const reports = reportsByPltId.get(row.id) || [];
    return {
      id: row.id,
      prescriptionId: row.prescription_id,
      patientId: row.patient_id,
      labTestId: row.lab_test_id,
      testName: row.test_name,
      instructions: row.instructions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      prescriptionDate: formatDateOnlyOrNull(row.prescription_date),
      doctorId: row.doctor_id,
      doctorName: row.doctor_name,
      doctorSpecialization: row.doctor_specialization,
      reports,
      status: reports.length > 0 ? 'Uploaded' : 'Not Uploaded',
      isExternal: false,
    };
  });

  // Convert external reports into PatientPrescribedLabTest items for uniform Medical Records listing
  for (const ext of externalReports) {
    result.push({
      id: ext.id,
      prescriptionId: '',
      patientId: ext.patientId || primaryId,
      labTestId: null,
      testName: ext.testName || ext.fileName || 'External Lab Report',
      instructions: ext.notes || null,
      createdAt: ext.createdAt,
      updatedAt: ext.updatedAt,
      prescriptionDate: ext.reportDate,
      doctorId: null,
      doctorName: 'Self / External Lab',
      doctorSpecialization: null,
      reports: [ext],
      status: 'Uploaded',
      isExternal: true,
    });
  }

  return result;
}

export async function getPrescribedLabTestDetail(
  userId: string,
  prescriptionLabTestId: string
): Promise<PatientPrescribedLabTest> {
  if (!UUID_REGEX.test(prescriptionLabTestId)) {
    throw new NotFoundError('Prescribed lab test');
  }

  const { primaryId, allIds } = await resolvePatientAllIds(userId);

  // Check if it is an external report directly queried by id
  const extReport = await queryOne<any>(
    `SELECT * FROM lab_test_reports WHERE id = $1 AND (patient_id = ANY($2::uuid[]) OR uploaded_by_id = $3::uuid) AND is_external = true`,
    [prescriptionLabTestId, allIds, userId]
  );

  if (extReport) {
    const signedUrl = await signDocumentUrl(extReport.storage_key, extReport.document_url);
    const rep: PrescribedLabTestReport = {
      id: extReport.id,
      prescriptionLabTestId: null,
      patientId: extReport.patient_id,
      fileName: extReport.file_name,
      fileType: extReport.file_type,
      fileSize: Number(extReport.file_size || 0),
      reportDate: formatDateOnly(extReport.report_date),
      documentUrl: signedUrl,
      storageKey: extReport.storage_key,
      notes: extReport.notes,
      uploadedBy: extReport.uploaded_by,
      isExternal: true,
      testName: extReport.test_name,
      createdAt: extReport.created_at,
      updatedAt: extReport.updated_at,
    };
    return {
      id: extReport.id,
      prescriptionId: '',
      patientId: extReport.patient_id || primaryId,
      labTestId: null,
      testName: extReport.test_name || extReport.file_name || 'External Lab Report',
      instructions: extReport.notes || null,
      createdAt: extReport.created_at,
      updatedAt: extReport.updated_at,
      prescriptionDate: formatDateOnlyOrNull(extReport.report_date),
      doctorId: null,
      doctorName: 'Self / External Lab',
      doctorSpecialization: null,
      reports: [rep],
      status: 'Uploaded',
      isExternal: true,
    };
  }

  // Fetch prescription_lab_test
  const testSql = `
    SELECT 
      plt.id,
      plt.prescription_id,
      plt.patient_id,
      plt.lab_test_id,
      plt.test_name,
      plt.instructions,
      plt.created_at,
      plt.updated_at,
      p.prescription_date,
      p.doctor_id,
      COALESCE(d.name, 'Dr. Narendran') as doctor_name,
      d.specialization as doctor_specialization
    FROM prescription_lab_tests plt
    JOIN prescriptions p ON p.id = plt.prescription_id
    LEFT JOIN doctors d ON d.id = p.doctor_id
    WHERE plt.id = $1
  `;

  const test = await queryOne<any>(testSql, [prescriptionLabTestId]);

  if (!test) {
    throw new NotFoundError('Prescribed lab test');
  }

  const isOwner = allIds.includes(test.patient_id);
  if (!isOwner) {
    const presMatch = await queryOne(
      `SELECT id FROM prescriptions WHERE id = $1 AND patient_id = ANY($2::uuid[])`,
      [test.prescription_id, allIds]
    );
    if (!presMatch) {
      throw new ForbiddenError('You do not have permission to view this lab test.');
    }
  }

  // Fetch reports
  const reportsSql = `
    SELECT * FROM lab_test_reports 
    WHERE prescription_lab_test_id = $1 AND (patient_id = ANY($2::uuid[]) OR uploaded_by_id = $3::uuid)
    ORDER BY created_at DESC
  `;
  const reportsRows = await query<any>(reportsSql, [prescriptionLabTestId, allIds, userId]);

  const reports: PrescribedLabTestReport[] = [];
  for (const row of reportsRows) {
    const signedUrl = await signDocumentUrl(row.storage_key, row.document_url);
    reports.push({
      id: row.id,
      prescriptionLabTestId: row.prescription_lab_test_id,
      patientId: row.patient_id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: Number(row.file_size || 0),
      reportDate: formatDateOnly(row.report_date),
      documentUrl: signedUrl,
      storageKey: row.storage_key,
      notes: row.notes,
      uploadedBy: row.uploaded_by,
      isExternal: false,
      testName: row.test_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return {
    id: test.id,
    prescriptionId: test.prescription_id,
    patientId: test.patient_id,
    labTestId: test.lab_test_id,
    testName: test.test_name,
    instructions: test.instructions,
    createdAt: test.created_at,
    updatedAt: test.updated_at,
    prescriptionDate: formatDateOnlyOrNull(test.prescription_date),
    doctorId: test.doctor_id,
    doctorName: test.doctor_name,
    doctorSpecialization: test.doctor_specialization,
    reports,
    status: reports.length > 0 ? 'Uploaded' : 'Not Uploaded',
    isExternal: false,
  };
}

export async function uploadPrescribedLabReport(
  userId: string,
  prescriptionLabTestId: string,
  file: {
    buffer: Buffer;
    fileName: string;
    fileType: string;
    fileSize: number;
  },
  reportDate: string,
  notes?: string
): Promise<PrescribedLabTestReport> {
  if (!UUID_REGEX.test(prescriptionLabTestId)) {
    throw new NotFoundError('Prescribed lab test');
  }

  const { primaryId, allIds } = await resolvePatientAllIds(userId);

  const test = await queryOne<any>(
    `SELECT plt.id, plt.test_name, plt.patient_id, p.patient_id as pres_patient_id
     FROM prescription_lab_tests plt
     JOIN prescriptions p ON p.id = plt.prescription_id
     WHERE plt.id = $1`,
    [prescriptionLabTestId]
  );

  if (!test) {
    throw new NotFoundError('Prescribed lab test');
  }

  const isOwner = allIds.includes(test.patient_id) || allIds.includes(test.pres_patient_id);
  if (!isOwner) {
    throw new ForbiddenError('You do not have permission to upload a report for this lab test.');
  }

  const mimeType = file.fileType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError('Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG.');
  }

  if (file.fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError('File size exceeds the 15MB limit.');
  }

  if (!reportDate) {
    throw new ValidationError('Report date is required.');
  }

  const sanitizedFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `lab_reports/${primaryId}/${prescriptionLabTestId}/${Date.now()}_${sanitizedFileName}`;

  let uploadResult: { fileUrl: string; key: string };
  try {
    uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, mimeType);
  } catch (err) {
    const fileUrl = `https://s3.local/${storageKey}`;
    uploadResult = { fileUrl, key: storageKey };
  }

  try {
    const insertSql = `
      INSERT INTO lab_test_reports (
        prescription_lab_test_id,
        patient_id,
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PATIENT', false, $11
      ) RETURNING *
    `;
    const inserted = await queryOne<any>(insertSql, [
      prescriptionLabTestId,
      test.patient_id || primaryId,
      file.fileName,
      mimeType,
      file.fileSize,
      reportDate,
      uploadResult.fileUrl,
      uploadResult.key,
      notes || null,
      userId,
      test.test_name,
    ]);

    if (!inserted) {
      throw new Error('Failed to save lab test report record.');
    }

    const signedUrl = await signDocumentUrl(inserted.storage_key, inserted.document_url);

    const result: PrescribedLabTestReport = {
      id: inserted.id,
      prescriptionLabTestId: inserted.prescription_lab_test_id,
      patientId: inserted.patient_id,
      fileName: inserted.file_name,
      fileType: inserted.file_type,
      fileSize: Number(inserted.file_size || 0),
      reportDate: formatDateOnly(inserted.report_date) || reportDate,
      documentUrl: signedUrl,
      storageKey: inserted.storage_key,
      notes: inserted.notes,
      uploadedBy: inserted.uploaded_by,
      isExternal: false,
      testName: inserted.test_name,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };

    // Notify patient post-commit (fire-and-forget)
    const notifyPatientId = inserted.patient_id || primaryId;
    try {
      const { notificationService } = await import('@/modules/notifications/notification.service.js');
      void notificationService.sendToPatient(notifyPatientId, {
        type: 'LAB_REPORT_AVAILABLE',
        title: 'Lab Report Uploaded',
        body: `Your lab report for "${test.test_name}" is now available.`,
        entityType: 'LAB_REPORT',
        entityId: inserted.id,
        route: 'LabTests',
        idempotencyKey: `lab_report:${inserted.id}`,
        data: {
          reportId: inserted.id,
          prescriptionLabTestId,
          screen: 'LabTestDetails',
        },
      }).catch(() => { /* non-critical */ });
    } catch {
      // Notification failure must not affect the upload response
    }

    return result;
  } catch (dbErr) {
    try {
      if (uploadResult?.key) {
        await s3Service.deleteFile(uploadResult.key);
      }
    } catch {
      // ignore
    }
    throw dbErr;
  }
}

export async function uploadExternalLabReport(
  userId: string,
  file: {
    buffer: Buffer;
    fileName: string;
    fileType: string;
    fileSize: number;
  },
  testName: string,
  reportDate: string,
  notes?: string
): Promise<PrescribedLabTestReport> {
  const { primaryId } = await resolvePatientAllIds(userId);

  const mimeType = file.fileType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError('Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG.');
  }

  if (file.fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError('File size exceeds the 15MB limit.');
  }

  if (!testName || testName.trim() === '') {
    throw new ValidationError('Test name is required.');
  }

  if (!reportDate) {
    throw new ValidationError('Report date is required.');
  }

  const sanitizedFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `lab_reports/${primaryId}/external/${Date.now()}_${sanitizedFileName}`;

  let uploadResult: { fileUrl: string; key: string };
  try {
    uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, mimeType);
  } catch (err) {
    const fileUrl = `https://s3.local/${storageKey}`;
    uploadResult = { fileUrl, key: storageKey };
  }

  try {
    const insertSql = `
      INSERT INTO lab_test_reports (
        prescription_lab_test_id,
        patient_id,
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
        null, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'PATIENT', true, $10
      ) RETURNING *
    `;
    const inserted = await queryOne<any>(insertSql, [
      primaryId,
      file.fileName,
      mimeType,
      file.fileSize,
      reportDate,
      uploadResult.fileUrl,
      uploadResult.key,
      notes || null,
      userId,
      testName.trim(),
    ]);

    if (!inserted) {
      throw new Error('Failed to save external lab report record.');
    }

    const signedUrl = await signDocumentUrl(inserted.storage_key, inserted.document_url);

    const result: PrescribedLabTestReport = {
      id: inserted.id,
      prescriptionLabTestId: null,
      patientId: inserted.patient_id,
      fileName: inserted.file_name,
      fileType: inserted.file_type,
      fileSize: Number(inserted.file_size || 0),
      reportDate: formatDateOnly(inserted.report_date) || reportDate,
      documentUrl: signedUrl,
      storageKey: inserted.storage_key,
      notes: inserted.notes,
      uploadedBy: inserted.uploaded_by,
      isExternal: true,
      testName: inserted.test_name,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };

    // Notify patient post-commit (fire-and-forget)
    try {
      const { notificationService } = await import('@/modules/notifications/notification.service.js');
      void notificationService.sendToPatient(primaryId, {
        type: 'MEDICAL_RECORD_AVAILABLE',
        title: 'Medical Record Available',
        body: `Your external lab report "${testName.trim()}" has been saved.`,
        entityType: 'MEDICAL_RECORD',
        entityId: inserted.id,
        route: 'MedicalRecords',
        idempotencyKey: `med_record:${inserted.id}`,
        data: {
          reportId: inserted.id,
          screen: 'MedicalRecords',
        },
      }).catch(() => { /* non-critical */ });
    } catch {
      // Notification failure must not affect the upload response
    }

    return result;
  } catch (dbErr) {
    try {
      if (uploadResult?.key) {
        await s3Service.deleteFile(uploadResult.key);
      }
    } catch {
      // ignore
    }
    throw dbErr;
  }
}

export async function deleteReport(userId: string, reportId: string): Promise<{ success: boolean }> {
  if (!UUID_REGEX.test(reportId)) {
    throw new NotFoundError('Lab report');
  }

  const { allIds } = await resolvePatientAllIds(userId);

  const report = await queryOne<any>(
    `SELECT * FROM lab_test_reports WHERE id = $1`,
    [reportId]
  );

  if (!report) {
    throw new NotFoundError('Lab report');
  }

  const isOwner = allIds.includes(report.patient_id) || report.uploaded_by_id === userId;
  if (!isOwner) {
    throw new ForbiddenError('You do not have permission to delete this report.');
  }

  if (report.storage_key) {
    try {
      await s3Service.deleteFile(report.storage_key);
    } catch {
      // ignore
    }
  }

  await query('DELETE FROM lab_test_reports WHERE id = $1', [reportId]);
  return { success: true };
}
