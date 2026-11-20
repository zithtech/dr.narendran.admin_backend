import type { Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '@/http/errors.js';
import {
  createMedicalDocumentSchema,
  createPatientMedicalHistorySchema,
  updatePatientMedicalHistorySchema,
} from './patientMedicalHistory.schema.js';
import { patientMedicalHistoryService } from './patientMedicalHistory.service.js';

function getParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export const PatientMedicalHistoryController = {
  async getHistories(req: Request, res: Response): Promise<void> {
    const patientId = getParam(req.params['patientId']);
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }
    const histories = await patientMedicalHistoryService.getHistoriesByPatientId(patientId);
    res.json(histories);
  },

  async getLatest(req: Request, res: Response): Promise<void> {
    const patientId = getParam(req.params['patientId']);
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }
    const latest = await patientMedicalHistoryService.getLatestHistory(patientId);
    res.json(latest);
  },

  async getById(req: Request, res: Response): Promise<void> {
    const historyId = getParam(req.params['historyId']);
    if (!historyId) {
      throw new ValidationError('History ID is required');
    }
    const history = await patientMedicalHistoryService.getHistoryById(historyId);
    res.json(history);
  },

  async create(req: Request, res: Response): Promise<void> {
    const patientId = getParam(req.params['patientId']);
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }
    const validated = createPatientMedicalHistorySchema.parse(req.body);
    const result = await patientMedicalHistoryService.createHistory(
      patientId,
      validated,
      req.user as any,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response): Promise<void> {
    const historyId = getParam(req.params['historyId']);
    if (!historyId) {
      throw new ValidationError('History ID is required');
    }
    const validated = updatePatientMedicalHistorySchema.parse(req.body);
    const result = await patientMedicalHistoryService.updateHistory(
      historyId,
      validated,
      req.user as any,
    );
    res.json(result);
  },

  async delete(req: Request, res: Response): Promise<void> {
    const historyId = getParam(req.params['historyId']);
    if (!historyId) {
      throw new ValidationError('History ID is required');
    }
    const success = await patientMedicalHistoryService.deleteHistory(historyId);
    res.json({ success });
  },

  async getDocuments(req: Request, res: Response): Promise<void> {
    const patientId = getParam(req.params['patientId']);
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }
    const documentType = req.query['type'] as string | undefined;
    const documents = await patientMedicalHistoryService.getDocumentsByPatientId(
      patientId,
      documentType,
    );
    res.json(documents);
  },

  async uploadDocument(req: Request, res: Response): Promise<void> {
    const patientId = getParam(req.params['patientId']);
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }

    const file = req.file;
    const body = req.body || {};

    const documentType = body.document_type || 'Other Medical Document';
    const title = body.title || file?.originalname || 'Medical Document';
    const notes = body.notes || null;
    const medicalHistoryId = body.medical_history_id || null;
    const documentDate = body.document_date || null;
    const fileUrl = body.file_url || null;

    if (!file && !fileUrl) {
      throw new ValidationError('Please provide a file or file URL to upload');
    }

    const document = await patientMedicalHistoryService.uploadAndCreateDocument(
      patientId,
      {
        file: file ?? undefined,
        document_type: documentType,
        title,
        notes,
        medical_history_id: medicalHistoryId,
        document_date: documentDate,
        file_url: fileUrl,
      },
      req.user as any,
    );

    res.status(201).json(document);
  },

  async deleteDocument(req: Request, res: Response): Promise<void> {
    const documentId = getParam(req.params['documentId']);
    if (!documentId) {
      throw new ValidationError('Document ID is required');
    }
    const success = await patientMedicalHistoryService.deleteDocument(documentId);
    res.json({ success });
  },
};
