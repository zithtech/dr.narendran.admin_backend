import type { Request, Response } from 'express';
import { ValidationError } from '@/http/errors.js';
import {
  listMedicalRecordsQuerySchema,
  updateMedicalRecordBodySchema,
  uploadMedicalRecordBodySchema,
} from './medicalRecords.schema.js';
import { medicalRecordsService } from './medicalRecords.service.js';

export class MedicalRecordsController {
  async listRecords(req: Request, res: Response): Promise<void> {
    const query = listMedicalRecordsQuerySchema.parse(req.query);
    const result = await medicalRecordsService.listRecords(query);
    res.json(result);
  }

  async getRecordById(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new ValidationError('Record ID is required');
    }
    const record = await medicalRecordsService.getRecordById(id);
    res.json(record);
  }

  async getPatientDossier(req: Request, res: Response): Promise<void> {
    const rawId = req.params['patientId'];
    const patientId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!patientId) {
      throw new ValidationError('Patient ID is required');
    }
    const dossier = await medicalRecordsService.getPatientDossier(patientId);
    res.json(dossier);
  }

  async uploadMedicalRecord(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new ValidationError('A file is required for upload');
    }

    const body = uploadMedicalRecordBodySchema.parse(req.body);
    const uploaderId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    const uploaderRole = req.user?.role || 'admin';

    const record = await medicalRecordsService.uploadMedicalRecord({
      patientId: body.patientId,
      testName: body.testName,
      reportDate: body.reportDate,
      notes: body.notes,
      prescriptionLabTestId: body.prescriptionLabTestId,
      isExternal: body.isExternal,
      allowDuplicate: body.allowDuplicate,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
      uploaderId,
      uploaderRole,
    });

    res.status(201).json(record);
  }

  async updateMedicalRecord(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new ValidationError('Record ID is required');
    }
    const updates = updateMedicalRecordBodySchema.parse(req.body);
    const record = await medicalRecordsService.updateMedicalRecord(id, updates);
    res.json(record);
  }

  async deleteMedicalRecord(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new ValidationError('Record ID is required');
    }
    await medicalRecordsService.deleteMedicalRecord(id);
    res.json({ success: true, message: 'Medical record deleted successfully' });
  }

  async downloadRecord(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new ValidationError('Record ID is required');
    }
    const result = await medicalRecordsService.getDownloadUrl(id);
    res.json(result);
  }

  async viewRecord(req: Request, res: Response): Promise<void> {
    const rawId = req.params['id'];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new ValidationError('Record ID is required');
    }

    const docData = await medicalRecordsService.getRecordStream(id);
    const isDownload = req.query['download'] === 'true' || req.query['download'] === '1';

    res.setHeader('Content-Type', docData.mimeType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(docData.fileName)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (docData.buffer) {
      res.send(docData.buffer);
    } else if (docData.stream) {
      docData.stream.pipe(res);
    } else {
      res.status(404).json({ error: 'Record content is currently unavailable.' });
    }
  }
}

export const medicalRecordsController = new MedicalRecordsController();
