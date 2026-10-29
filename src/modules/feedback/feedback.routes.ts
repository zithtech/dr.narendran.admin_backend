import { Router } from 'express';

import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
import { handler } from '@/http/middleware/validate.js';

import { feedbackController } from './feedback.controller.js';
import {
  consultationParamSchema,
  consultationStageParamSchema,
  saveDraftBodySchema,
  stageParamSchema,
  submitFeedbackBodySchema,
} from './feedback.schema.js';

export const feedbackRouter: Router = Router();

/**
 * GET /api/patient/feedback/eligible
 * Returns eligible consultations for the authenticated patient
 */
feedbackRouter.get(
  '/eligible',
  requireAuth,
  requireRole('patient', 'admin'),
  (req, res, next) => {
    feedbackController.getEligibleConsultations(req, res).catch(next);
  },
);

/**
 * GET /api/patient/feedback/forms/:stage
 * Returns active form definition and ordered questions for the stage
 */
feedbackRouter.get(
  '/forms/:stage',
  requireAuth,
  ...handler({ params: stageParamSchema }, (input, req, res) =>
    feedbackController.getForm(input, req, res),
  ),
);

/**
 * GET /api/patient/feedback/consultations/:consultationId/report/download
 * Downloads generated PDF outcome report
 */
feedbackRouter.get(
  '/consultations/:consultationId/report/download',
  requireAuth,
  ...handler({ params: consultationParamSchema }, (input, req, res) =>
    feedbackController.downloadReportPdf(input, req, res),
  ),
);

/**
 * GET /api/patient/feedback/consultations/:consultationId/report
 * Returns structured consultation outcome and comparative report
 */
feedbackRouter.get(
  '/consultations/:consultationId/report',
  requireAuth,
  ...handler({ params: consultationParamSchema }, (input, req, res) =>
    feedbackController.getComparisonReport(input, req, res),
  ),
);

/**
 * POST /api/patient/feedback/consultations/:consultationId/:stage/draft
 * Saves or updates draft responses
 */
feedbackRouter.post(
  '/consultations/:consultationId/:stage/draft',
  requireAuth,
  requireRole('patient', 'admin'),
  ...handler(
    {
      params: consultationStageParamSchema,
      body: saveDraftBodySchema,
    },
    (input, req, res) => feedbackController.saveDraft(input, req, res),
  ),
);

/**
 * POST /api/patient/feedback/consultations/:consultationId/:stage/submit
 * Submits final feedback responses transactionally
 */
feedbackRouter.post(
  '/consultations/:consultationId/:stage/submit',
  requireAuth,
  requireRole('patient', 'admin'),
  ...handler(
    {
      params: consultationStageParamSchema,
      body: submitFeedbackBodySchema,
    },
    (input, req, res) => feedbackController.submitFeedback(input, req, res),
  ),
);

/**
 * GET /api/patient/feedback/consultations/:consultationId/:stage
 * Returns draft or submitted assessment for a stage
 */
feedbackRouter.get(
  '/consultations/:consultationId/:stage',
  requireAuth,
  ...handler({ params: consultationStageParamSchema }, (input, req, res) =>
    feedbackController.getSubmissionOrDraft(input, req, res),
  ),
);

/**
 * GET /api/patient/feedback/consultations/:consultationId
 * Returns feedback history and answers for both stages
 */
feedbackRouter.get(
  '/consultations/:consultationId',
  requireAuth,
  ...handler({ params: consultationParamSchema }, (input, req, res) =>
    feedbackController.getFeedbackHistory(input, req, res),
  ),
);
