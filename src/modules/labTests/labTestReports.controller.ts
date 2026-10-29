import type { Request, Response } from 'express';

import { UnauthorizedError, ValidationError } from '@/http/errors.js';

import * as labTestReportsService from './labTestReports.service.js';

export async function getPatientPrescribedLabTests(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const labTests = await labTestReportsService.getPatientPrescribedLabTests(req.user.id);
  res.status(200).json({ labTests });
}

export async function getPrescribedLabTestDetail(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const rawId = req.params['prescriptionLabTestId'] || req.params['id'];
  const prescriptionLabTestId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!prescriptionLabTestId) {
    throw new ValidationError('Prescription lab test ID is required.');
  }
  const labTest = await labTestReportsService.getPrescribedLabTestDetail(req.user.id, prescriptionLabTestId);
  res.status(200).json(labTest);
}

export async function uploadPrescribedLabReport(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const rawId = req.params['prescriptionLabTestId'] || req.params['id'];
  const prescriptionLabTestId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!prescriptionLabTestId) {
    throw new ValidationError('Prescription lab test ID is required.');
  }

  let buffer: Buffer;
  let fileName: string;
  let fileType: string;
  let fileSize: number;
  let reportDate: string = req.body?.reportDate || req.body?.report_date || '';
  const notes: string | undefined = req.body?.notes;

  if (req.file) {
    buffer = req.file.buffer;
    fileName = req.file.originalname;
    fileType = req.file.mimetype;
    fileSize = req.file.size;
  } else if (req.body?.fileBase64 || req.body?.file) {
    const rawBase64 = req.body.fileBase64 || req.body.file?.base64 || req.body.file;
    const cleanBase64 = typeof rawBase64 === 'string' && rawBase64.includes('base64,') ? rawBase64.split('base64,')[1] : rawBase64;
    buffer = Buffer.from(cleanBase64, 'base64');
    fileName = req.body.fileName || req.body.file?.fileName || 'lab_report.pdf';
    fileType = req.body.fileType || req.body.file?.fileType || 'application/pdf';
    fileSize = buffer.length;
  } else {
    throw new ValidationError('File is required for upload.');
  }

  if (!reportDate) {
    reportDate = new Date().toISOString().split('T')[0] ?? '';
  }

  const report = await labTestReportsService.uploadPrescribedLabReport(
    req.user.id,
    prescriptionLabTestId,
    { buffer, fileName, fileType, fileSize },
    reportDate,
    notes
  );

  res.status(201).json(report);
}

export async function uploadExternalLabReport(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  let buffer: Buffer;
  let fileName: string;
  let fileType: string;
  let fileSize: number;
  let testName: string = req.body?.testName || req.body?.test_name;
  let reportDate: string = req.body?.reportDate || req.body?.report_date || '';
  const notes: string | undefined = req.body?.notes;

  if (req.file) {
    buffer = req.file.buffer;
    fileName = req.file.originalname;
    fileType = req.file.mimetype;
    fileSize = req.file.size;
  } else if (req.body?.fileBase64 || req.body?.file) {
    const rawBase64 = req.body.fileBase64 || req.body.file?.base64 || req.body.file;
    const cleanBase64 = typeof rawBase64 === 'string' && rawBase64.includes('base64,') ? rawBase64.split('base64,')[1] : rawBase64;
    buffer = Buffer.from(cleanBase64, 'base64');
    fileName = req.body.fileName || req.body.file?.fileName || 'lab_report.pdf';
    fileType = req.body.fileType || req.body.file?.fileType || 'application/pdf';
    fileSize = buffer.length;
  } else {
    throw new ValidationError('File is required for upload.');
  }

  if (!testName) {
    testName = fileName.replace(/\.[^/.]+$/, '');
  }

  if (!reportDate) {
    reportDate = new Date().toISOString().split('T')[0] ?? '';
  }

  const report = await labTestReportsService.uploadExternalLabReport(
    req.user.id,
    { buffer, fileName, fileType, fileSize },
    testName,
    reportDate,
    notes
  );

  res.status(201).json(report);
}

export async function deleteReport(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const rawId = req.params['reportId'] || req.params['id'];
  const reportId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!reportId) {
    throw new ValidationError('Report ID is required.');
  }
  const result = await labTestReportsService.deleteReport(req.user.id, reportId);
  res.status(200).json(result);
}
