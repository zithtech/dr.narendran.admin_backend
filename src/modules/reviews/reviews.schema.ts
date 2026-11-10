import { z } from 'zod';

export const submitReviewBodySchema = z.object({
  appointment_id: z.string().uuid('Valid appointment ID is required'),
  rating: z.coerce
    .number()
    .int('Rating must be an integer')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  review_comment: z
    .string()
    .trim()
    .max(2000, 'Review comment must be less than 2000 characters')
    .optional()
    .nullable(),
  communication_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  experience_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  professionalism_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  waiting_time_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  satisfaction_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
});

export const updateReviewBodySchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional(),
  review_comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable(),
  communication_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  experience_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  professionalism_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  waiting_time_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  satisfaction_rating: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
});

export const doctorReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
});

export const adminReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  doctor_id: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'HIDDEN', 'FLAGGED']).default('ALL'),
  search: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export const moderateReviewBodySchema = z.object({
  action: z.enum(['FLAG', 'HIDE', 'RESTORE']),
  reason: z.string().trim().min(2, 'Moderation reason is required').max(1000),
});
