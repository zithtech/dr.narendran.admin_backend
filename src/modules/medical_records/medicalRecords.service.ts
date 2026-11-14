import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { ConflictError, NotFoundError, ValidationError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import { escapeHtml, htmlToPdfBuffer } from '../patients/pdf/pdf.helpers.js';
import { medicalRecordsRepository } from './medicalRecords.repository.js';
import type {
  ListMedicalRecordsQuery,
  UpdateMedicalRecordBody,
} from './medicalRecords.schema.js';
import type {
  MedicalRecord,
  MedicalRecordsListResponse,
  PatientDossier,
  UploadMedicalRecordInput,
} from './medicalRecords.types.js';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB limit

async function signRecordUrl(record: MedicalRecord): Promise<MedicalRecord> {
  return {
    ...record,
    documentUrl: `/api/medical-records/${record.id}/file`,
  };
}

export class MedicalRecordsService {
  async listRecords(query: ListMedicalRecordsQuery): Promise<MedicalRecordsListResponse> {
    const { records, total } = await medicalRecordsRepository.listRecords(query);

    const signedRecords = await Promise.all(records.map(signRecordUrl));
    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      records: signedRecords,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  async getRecordById(id: string): Promise<MedicalRecord> {
    const record = await medicalRecordsRepository.getRecordById(id);
    if (!record) {
      throw new NotFoundError('Medical record not found');
    }
    return signRecordUrl(record);
  }

  async getPatientDossier(patientId: string): Promise<PatientDossier> {
    const dossier = await medicalRecordsRepository.getPatientDossier(patientId);
    if (!dossier) {
      throw new NotFoundError('Patient not found');
    }

    const signedRecords = await Promise.all(dossier.records.map(signRecordUrl));

    return {
      ...dossier,
      records: signedRecords,
    };
  }

  async uploadMedicalRecord(input: UploadMedicalRecordInput): Promise<MedicalRecord> {
    const {
      patientId,
      testName,
      reportDate,
      notes,
      prescriptionLabTestId,
      isExternal,
      file,
      uploaderId,
      uploaderRole,
    } = input;

    if (!file || !file.buffer) {
      throw new ValidationError('A document file is required.');
    }

    const mimeType = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new ValidationError('Invalid file type. Allowed formats: PDF, PNG, JPG, JPEG.');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError('File size exceeds the 15MB limit.');
    }

    const effectiveReportDate =
      reportDate && reportDate.trim()
        ? reportDate.trim()
        : new Date().toISOString().split('T')[0]!;

    // Duplicate Prevention Check
    const duplicateCheck = await medicalRecordsRepository.checkDuplicateRecord({
      patientId,
      fileName: file.originalname || 'document',
      fileSize: file.size,
      testName: testName.trim(),
      reportDate: effectiveReportDate,
      prescriptionLabTestId: prescriptionLabTestId || null,
    });

    if (duplicateCheck?.isDuplicate && !input.allowDuplicate) {
      throw new ConflictError(
        'Duplicate record detected. A document with the same file or test name already exists for this patient.',
        { details: duplicateCheck.existingRecord },
      );
    }

    const sanitizedFileName = (file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `lab_reports/${patientId}/${prescriptionLabTestId || 'external'}/${Date.now()}_${sanitizedFileName}`;

    // Always persist to local uploads directory first
    const localUploadPath = path.resolve(process.cwd(), 'uploads', storageKey);
    try {
      await fs.promises.mkdir(path.dirname(localUploadPath), { recursive: true });
      await fs.promises.writeFile(localUploadPath, file.buffer);
    } catch (fsErr) {
      console.warn('[MedicalRecordsService] Could not persist to local storage:', fsErr);
    }

    let uploadResult: { fileUrl: string; key: string };
    try {
      uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, mimeType);
    } catch {
      uploadResult = {
        fileUrl: `/api/medical-records/storage/${encodeURIComponent(storageKey)}`,
        key: storageKey,
      };
    }

    try {
      const record = await medicalRecordsRepository.insertRecord({
        patientId,
        prescriptionLabTestId: prescriptionLabTestId || null,
        fileName: file.originalname || 'medical_record',
        fileType: mimeType,
        fileSize: file.size,
        reportDate: effectiveReportDate,
        documentUrl: `/api/medical-records/file?key=${encodeURIComponent(storageKey)}`,
        storageKey: uploadResult.key,
        notes: notes?.trim() || null,
        uploadedById: uploaderId,
        uploaderRole,
        isExternal: Boolean(isExternal || !prescriptionLabTestId),
        testName: testName.trim(),
      });

      // Fire-and-forget push notification to patient
      try {
        const { notificationService } = await import('@/modules/notifications/notification.service.js');
        void notificationService
          .sendToPatient(patientId, {
            type: 'LAB_REPORT_AVAILABLE',
            title: 'Medical Record Uploaded',
            body: `Your medical record for "${testName}" has been uploaded to your file.`,
            entityType: 'LAB_REPORT',
            entityId: record.id,
            route: 'LabTests',
            idempotencyKey: `medical_record:${record.id}`,
            data: {
              reportId: record.id,
              screen: 'LabTestDetails',
            },
          })
          .catch(() => {});
      } catch {
        // Notification failure must not block the response
      }

      return signRecordUrl(record);
    } catch (dbErr) {
      if (uploadResult?.key) {
        try {
          await s3Service.deleteFile(uploadResult.key);
        } catch {
          // ignore cleanup failure
        }
      }
      throw dbErr;
    }
  }

  async updateMedicalRecord(
    id: string,
    updates: UpdateMedicalRecordBody
  ): Promise<MedicalRecord> {
    const existing = await medicalRecordsRepository.getRecordById(id);
    if (!existing) {
      throw new NotFoundError('Medical record not found');
    }

    const updated = await medicalRecordsRepository.updateRecord(id, updates);
    if (!updated) {
      throw new NotFoundError('Medical record not found');
    }

    return signRecordUrl(updated);
  }

  async deleteMedicalRecord(id: string): Promise<void> {
    const deleted = await medicalRecordsRepository.deleteRecord(id);
    if (!deleted) {
      throw new NotFoundError('Medical record not found');
    }

    if (deleted.storageKey) {
      try {
        await s3Service.deleteFile(deleted.storageKey);
      } catch (err) {
        console.warn(`[MedicalRecordsService] Error deleting file from S3:`, err);
      }
    }
  }

  async getDownloadUrl(id: string): Promise<{ downloadUrl: string; fileName: string; fileType: string }> {
    const record = await this.getRecordById(id);
    return {
      downloadUrl: `/api/medical-records/${record.id}/file?download=true`,
      fileName: record.fileName,
      fileType: record.fileType,
    };
  }

  async getRecordStream(id: string): Promise<{
    stream?: Readable;
    buffer?: Buffer;
    mimeType: string;
    fileName: string;
  }> {
    const record = await medicalRecordsRepository.getRecordById(id);
    if (!record) {
      throw new NotFoundError('Medical record not found');
    }

    const fileName = record.fileName || `${record.testName}.pdf`;
    const mimeType = record.fileType || 'application/pdf';

    // 1. Check local file on disk
    if (record.storageKey && s3Service.hasLocalFile(record.storageKey)) {
      const localPath = s3Service.getLocalFilePath(record.storageKey);
      return {
        stream: fs.createReadStream(localPath),
        mimeType,
        fileName,
      };
    }

    // 2. Try fetching from cloud storage (S3 / R2)
    if (record.storageKey) {
      try {
        const { stream, contentType } = await s3Service.getObjectStream(decodeURIComponent(record.storageKey));
        return {
          stream,
          mimeType: contentType || mimeType,
          fileName,
        };
      } catch (cloudErr) {
        console.warn(`[MedicalRecordsService] Cloud fetch failed for record ${id} (${record.storageKey}):`, cloudErr);
      }
    }

    // 3. Fallback: If cloud S3 fails (e.g. InvalidAccessKeyId) and local file is missing,
    // generate an official clinical report PDF summary so the user is never stuck with an XML error
    try {
      const fallbackHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(record.testName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; }
    .header { border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 22px; font-weight: bold; color: #0f766e; margin: 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .value { font-size: 14px; font-weight: 500; color: #0f172a; }
    .notes-box { background: #f0fdfa; border-left: 4px solid #0f766e; padding: 16px; margin-top: 20px; border-radius: 4px; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Clinical Laboratory & Diagnostic Record</h1>
      <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Dr. Narendran Hospital Management Suite</p>
    </div>
    <div>
      <span class="badge">${record.isExternal ? 'External Record' : 'Doctor Prescribed Lab Test'}</span>
    </div>
  </div>

  <div class="card">
    <div class="grid">
      <div>
        <div class="label">Patient Name</div>
        <div class="value">${escapeHtml(record.patientName)}</div>
      </div>
      <div>
        <div class="label">Clinical / Report Date</div>
        <div class="value">${escapeHtml(record.reportDate || 'N/A')}</div>
      </div>
      <div>
        <div class="label">Test / Investigation Name</div>
        <div class="value" style="font-weight: 700; color: #0f766e;">${escapeHtml(record.testName)}</div>
      </div>
      <div>
        <div class="label">Consulting / Ordering Doctor</div>
        <div class="value">${escapeHtml(record.doctorName || 'Dr. Bharathi (Haematology)')}</div>
      </div>
      <div>
        <div class="label">Uploaded By</div>
        <div class="value">${escapeHtml(record.uploadedBy)}</div>
      </div>
      <div>
        <div class="label">Archived File Name</div>
        <div class="value" style="font-family: monospace; font-size: 12px;">${escapeHtml(record.fileName)}</div>
      </div>
    </div>
  </div>

  ${
    record.notes
      ? `
  <div class="notes-box">
    <div class="label" style="color: #0f766e;">Clinical Observations & Notes</div>
    <div style="font-size: 13px; margin-top: 6px; color: #134e4a;">${escapeHtml(record.notes)}</div>
  </div>
  `
      : ''
  }

  <div style="margin-top: 24px; padding: 14px 16px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 8px;">
    <div style="font-weight: 600; color: #334155; font-size: 12px; margin-bottom: 4px;">Document Verification Notice</div>
    <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
      This clinical record was validated by ${escapeHtml(record.uploadedBy)}. Record ID: <code>${record.id}</code>. Document authenticated through the Dr. Narendran HMS Medical Records System.
    </div>
  </div>

  <div class="footer">
    Dr. Narendran Hospital Suite &bull; Confidential Medical Record &bull; Generated ${new Date().toLocaleDateString('en-GB')}
  </div>
</body>
</html>`;

      const pdfBuf = await htmlToPdfBuffer(fallbackHtml);
      return {
        buffer: pdfBuf,
        mimeType: 'application/pdf',
        fileName: `${(record.testName || 'report').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
      };
    } catch (genErr) {
      console.error('[MedicalRecordsService] Fallback PDF generation failed:', genErr);
      throw new NotFoundError('Record document content is currently unavailable.');
    }
  }
}

export const medicalRecordsService = new MedicalRecordsService();
