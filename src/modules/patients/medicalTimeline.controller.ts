import type { Request, Response } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '@/http/errors.js';

import {
  getMedicalHistorySchema,
  getMedicalTimelineSchema,
  medicalSummaryBodySchema,
  medicalSummaryQuerySchema,
} from './medicalTimeline.schema.js';
import { medicalTimelineService } from './medicalTimeline.service.js';
import { medicalSummaryService } from './medicalSummary.service.js';
import { MedicalHistoryPdfService, SecondOpinionPdfService } from './pdf/index.js';
import type { SecondOpinionRequest } from './medicalTimeline.types.js';

export const MedicalTimelineController = {
  async downloadMedicalHistoryPdf(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      const input = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
      const parsedQuery = getMedicalHistorySchema.parse(input);
      const history = await medicalTimelineService.getMedicalHistory(
        req.user.id,
        parsedQuery,
      );
      const pdfBuffer = await MedicalHistoryPdfService.generatePdf(history);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="medical_history_${req.user.id.slice(0, 8)}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message || 'Invalid query parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },

  async downloadSecondOpinionPdf(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      let options: SecondOpinionRequest = {};

      if (req.method === 'POST') {
        const body = medicalSummaryBodySchema.parse(req.body);
        options = {
          date_range: body.date_range,
          from_date: body.from_date || body.date_range?.from,
          to_date: body.to_date || body.date_range?.to,
          sections: body.sections,
        };
      } else {
        const query = medicalSummaryQuerySchema.parse(req.query);
        let sections: any = undefined;
        if (typeof query.sections === 'string') {
          sections = query.sections.split(',').map((s) => s.trim());
        } else if (Array.isArray(query.sections)) {
          sections = query.sections;
        }

        options = {
          from_date: query.from_date,
          to_date: query.to_date,
          sections,
        };
      }

      const summary = await medicalSummaryService.getSecondOpinionSummary(
        req.user.id,
        options,
      );
      const pdfBuffer = await SecondOpinionPdfService.generatePdf(summary);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="second_opinion_${req.user.id.slice(0, 8)}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message || 'Invalid parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },
  async getMedicalHistory(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      const parsedQuery = getMedicalHistorySchema.parse(req.query);
      const history = await medicalTimelineService.getMedicalHistory(
        req.user.id,
        parsedQuery,
      );
      res.json(history);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message || 'Invalid query parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },
  async getMedicalTimeline(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      const parsedQuery = getMedicalTimelineSchema.parse(req.query);
      const timeline = await medicalTimelineService.getMedicalTimeline(
        req.user.id,
        parsedQuery,
      );
      res.json(timeline);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message || 'Invalid query parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },

  async getMedicalSummary(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      let options: SecondOpinionRequest = {};

      if (req.method === 'POST') {
        const body = medicalSummaryBodySchema.parse(req.body);
        options = {
          date_range: body.date_range,
          from_date: body.from_date || body.date_range?.from,
          to_date: body.to_date || body.date_range?.to,
          sections: body.sections,
        };
      } else {
        const query = medicalSummaryQuerySchema.parse(req.query);
        let sections: any = undefined;
        if (typeof query.sections === 'string') {
          sections = query.sections.split(',').map((s) => s.trim());
        } else if (Array.isArray(query.sections)) {
          sections = query.sections;
        }

        options = {
          from_date: query.from_date,
          to_date: query.to_date,
          sections,
        };
      }

      const summary = await medicalSummaryService.getSecondOpinionSummary(
        req.user.id,
        options,
      );
      res.json(summary);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message || 'Invalid parameters',
          details: err.issues,
        });
        return;
      }
      throw err;
    }
  },
};
