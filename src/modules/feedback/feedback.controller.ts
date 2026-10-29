import type { Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';

import type {
  ConsultationParam,
  ConsultationStageParam,
  SaveDraftBody,
  StageParam,
  SubmitFeedbackBody,
} from './feedback.schema.js';
import { feedbackService } from './feedback.service.js';
import { FeedbackReportPdfService } from './feedbackReportPdf.service.js';

export class FeedbackController {
  /**
   * GET /api/patient/feedback/eligible
   */
  async getEligibleConsultations(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.getEligibleConsultations(req.user.id);
    res.status(200).json({
      status: 'success',
      count: data.length,
      data,
    });
  }

  /**
   * GET /api/patient/feedback/forms/:stage
   */
  async getForm(
    input: { params: StageParam },
    _req: Request,
    res: Response,
  ): Promise<void> {
    const data = await feedbackService.getForm(input.params.stage);
    res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * GET /api/patient/feedback/consultations/:consultationId/:stage
   */
  async getSubmissionOrDraft(
    input: { params: ConsultationStageParam },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.getSubmissionOrDraft(
      req.user.id,
      input.params.consultationId,
      input.params.stage,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * POST /api/patient/feedback/consultations/:consultationId/:stage/draft
   */
  async saveDraft(
    input: { params: ConsultationStageParam; body: SaveDraftBody },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.saveDraft(
      req.user.id,
      input.params.consultationId,
      input.params.stage,
      input.body.answers,
      input.body.treatmentId,
    );

    res.status(200).json({
      status: 'success',
      message: 'Draft saved successfully',
      data,
    });
  }

  /**
   * POST /api/patient/feedback/consultations/:consultationId/:stage/submit
   */
  async submitFeedback(
    input: { params: ConsultationStageParam; body: SubmitFeedbackBody },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.submitFeedback(
      req.user.id,
      input.params.consultationId,
      input.params.stage,
      input.body.answers,
      input.body.treatmentId,
    );

    res.status(200).json({
      status: 'success',
      message: 'Feedback submitted successfully',
      data,
    });
  }

  /**
   * GET /api/patient/feedback/consultations/:consultationId
   */
  async getFeedbackHistory(
    input: { params: ConsultationParam },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.getFeedbackHistory(
      req.user.id,
      input.params.consultationId,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * GET /api/patient/feedback/consultations/:consultationId/report
   */
  async getComparisonReport(
    input: { params: ConsultationParam },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const data = await feedbackService.getComparisonReport(
      req.user.id,
      input.params.consultationId,
      req.user.role,
    );

    res.status(200).json({
      status: 'success',
      data,
    });
  }

  /**
   * GET /api/patient/feedback/consultations/:consultationId/report/download
   */
  async downloadReportPdf(
    input: { params: ConsultationParam },
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const report = await feedbackService.getComparisonReport(
      req.user.id,
      input.params.consultationId,
      req.user.role,
    );

    const pdfBuffer = await FeedbackReportPdfService.generateReportPdf(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="consultation_feedback_report_${input.params.consultationId.slice(0, 8)}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}

export const feedbackController = new FeedbackController();
