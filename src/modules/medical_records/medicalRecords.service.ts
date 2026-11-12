import { ConflictError, NotFoundError, ValidationError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';
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
  if (!record.storageKey) return record;
  try {
    const signedUrl = await s3Service.getReadUrl(decodeURIComponent(record.storageKey), 86400);
    return { ...record, documentUrl: signedUrl };
  } catch {
    return {
      ...record,
      documentUrl: `/api/medical-records/${record.id}/file`,
    };
  }
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

    let uploadResult: { fileUrl: string; key: string };
    try {
      uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, mimeType);
    } catch {
      uploadResult = {
        fileUrl: `https://s3.local/${storageKey}`,
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
        documentUrl: uploadResult.fileUrl,
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
}

export const medicalRecordsService = new MedicalRecordsService();
