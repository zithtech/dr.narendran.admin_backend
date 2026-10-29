import { z } from 'zod';

import { FEEDBACK_STAGES } from './feedback.types.js';

export const stageParamSchema = z.object({
  stage: z.enum(FEEDBACK_STAGES, {
    message: "Stage must be either 'PRE_TREATMENT' or 'POST_TREATMENT'",
  }),
});

export const consultationParamSchema = z.object({
  consultationId: z.string().uuid({
    message: 'consultationId must be a valid UUID',
  }),
});

export const consultationStageParamSchema = z.object({
  consultationId: z.string().uuid({
    message: 'consultationId must be a valid UUID',
  }),
  stage: z.enum(FEEDBACK_STAGES, {
    message: "Stage must be either 'PRE_TREATMENT' or 'POST_TREATMENT'",
  }),
});

const answerInputSchema = z.object({
  questionId: z.string().uuid({
    message: 'questionId must be a valid UUID',
  }),
  answerValue: z.unknown(),
});

export const saveDraftBodySchema = z.object({
  treatmentId: z.string().uuid().optional(),
  answers: z.array(answerInputSchema).default([]),
});

export const submitFeedbackBodySchema = z.object({
  treatmentId: z.string().uuid().optional(),
  answers: z.array(answerInputSchema).min(1, {
    message: 'Answers must contain at least one response',
  }),
});

export type StageParam = z.infer<typeof stageParamSchema>;
export type ConsultationParam = z.infer<typeof consultationParamSchema>;
export type ConsultationStageParam = z.infer<typeof consultationStageParamSchema>;
export type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackBodySchema>;
