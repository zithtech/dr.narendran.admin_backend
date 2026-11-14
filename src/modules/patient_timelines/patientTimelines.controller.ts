import type { Request, Response } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '@/http/errors.js';
import {
  adminPatientListQuerySchema,
  adminPatientTimelineQuerySchema,
} from './patientTimelines.schema.js';
import { patientTimelinesService } from './patientTimelines.service.js';

export const patientTimelinesController = {
  /**
   * Admin: List registered patients with search, filters & pagination
   * GET /api/admin/patient-timelines/patients
   */
  async getPatients(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      const query = adminPatientListQuerySchema.parse(req.query);
      const result = await patientTimelinesService.getPatients(query);

      res.status(200).json({
        status: 'success',
        data: result.patients,
        pagination: result.pagination,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          status: 'error',
          message: err.issues[0]?.message || 'Invalid query parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },

  /**
   * Admin: Get comprehensive medical timeline for a patient
   * GET /api/admin/patient-timelines/:patientId
   */
  async getPatientTimeline(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const patientId = String(req.params['patientId'] || '').trim();
    if (!patientId) {
      res.status(400).json({ status: 'error', message: 'Patient ID is required.' });
      return;
    }

    try {
      const query = adminPatientTimelineQuerySchema.parse(req.query);
      const timeline = await patientTimelinesService.getPatientTimeline(patientId, query);

      res.status(200).json({
        status: 'success',
        data: timeline,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          status: 'error',
          message: err.issues[0]?.message || 'Invalid query parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },

  /**
   * Admin: Download clinical history summary PDF for a patient
   * GET /api/admin/patient-timelines/:patientId/pdf
   */
  async downloadPatientHistoryPdf(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const patientId = String(req.params['patientId'] || '').trim();
    if (!patientId) {
      res.status(400).json({ status: 'error', message: 'Patient ID is required.' });
      return;
    }

    const pdfBuffer = await patientTimelinesService.getPatientHistoryPdf(patientId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="patient_medical_history_${patientId.slice(0, 8)}.pdf"`,
    );
    res.send(pdfBuffer);
  },
};

