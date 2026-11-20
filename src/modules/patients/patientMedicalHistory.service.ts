import { NotFoundError, ValidationError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import {
  patientMedicalHistoryRepository,
} from './patientMedicalHistory.repository.js';
import type {
  MedicalDocumentType,
  PatientMedicalDocument,
  PatientMedicalHistoryRecord,
} from './patientMedicalHistory.types.js';

export class PatientMedicalHistoryService {
  async getHistoriesByPatientId(patientId: string): Promise<PatientMedicalHistoryRecord[]> {
    return patientMedicalHistoryRepository.getHistoriesByPatientId(patientId);
  }

  async getLatestHistory(patientId: string): Promise<PatientMedicalHistoryRecord | null> {
    return patientMedicalHistoryRepository.getLatestHistory(patientId);
  }

  async getHistoryById(id: string): Promise<PatientMedicalHistoryRecord> {
    const record = await patientMedicalHistoryRepository.getHistoryById(id);
    if (!record) {
      throw new NotFoundError('Patient medical history record not found');
    }
    return record;
  }

  async createHistory(
    patientId: string,
    data: any,
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalHistoryRecord> {
    return patientMedicalHistoryRepository.createHistory(patientId, data, user);
  }

  async updateHistory(
    id: string,
    data: any,
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalHistoryRecord> {
    return patientMedicalHistoryRepository.updateHistory(id, data, user);
  }

  async deleteHistory(id: string): Promise<boolean> {
    const existing = await patientMedicalHistoryRepository.getHistoryById(id);
    if (!existing) {
      throw new NotFoundError('Patient medical history record not found');
    }
    return patientMedicalHistoryRepository.deleteHistory(id);
  }

  async getDocumentsByPatientId(
    patientId: string,
    documentType?: string,
  ): Promise<PatientMedicalDocument[]> {
    const docs = await patientMedicalHistoryRepository.getDocumentsByPatientId(patientId, documentType);
    for (const doc of docs) {
      if (doc.storage_key) {
        try {
          doc.file_url = await s3Service.getReadUrl(doc.storage_key, 86400);
        } catch {
          // Keep existing file_url if presigned url fails
        }
      }
    }
    return docs;
  }

  async uploadAndCreateDocument(
    patientId: string,
    params: {
      file?: Express.Multer.File | undefined;
      document_type: MedicalDocumentType | string;
      title: string;
      notes?: string | null | undefined;
      medical_history_id?: string | null | undefined;
      document_date?: string | null | undefined;
      file_url?: string | null | undefined;
      file_name?: string | null | undefined;
      file_type?: string | null | undefined;
      file_size?: number | null | undefined;
    },
    user?: { id?: string; email?: string; fullName?: string },
  ): Promise<PatientMedicalDocument> {
    let fileUrl = params.file_url || '';
    let storageKey: string | null = null;
    let fileName = params.file_name || 'document';
    let fileType = params.file_type || 'application/octet-stream';
    let fileSize = params.file_size || 0;

    if (params.file) {
      const file = params.file;
      fileName = file.originalname;
      fileType = file.mimetype;
      fileSize = file.size;

      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      storageKey = `medical-documents/${patientId}/${Date.now()}_${sanitized}`;

      const uploadResult = await s3Service.uploadBuffer(storageKey, file.buffer, file.mimetype);
      fileUrl = uploadResult.fileUrl;
    }

    if (!fileUrl) {
      throw new ValidationError('A document file or document URL is required');
    }

    return patientMedicalHistoryRepository.createDocument(
      patientId,
      {
        medical_history_id: params.medical_history_id || null,
        document_type: params.document_type,
        title: params.title || fileName,
        file_name: fileName,
        file_url: fileUrl,
        storage_key: storageKey,
        file_type: fileType,
        file_size: fileSize,
        document_date: params.document_date || new Date().toISOString().split('T')[0],
        notes: params.notes || null,
      },
      user,
    );
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const doc = await patientMedicalHistoryRepository.getDocumentById(documentId);
    if (!doc) {
      throw new NotFoundError('Medical document not found');
    }
    return patientMedicalHistoryRepository.deleteDocument(documentId);
  }
}

export const patientMedicalHistoryService = new PatientMedicalHistoryService();
