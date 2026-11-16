import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { validate } from '@/http/middleware/validate.js';

import { reviewsController } from './reviews.controller.js';
import {
  adminReviewsQuerySchema,
  doctorReviewsQuerySchema,
  moderateReviewBodySchema,
  submitReviewBodySchema,
  updateReviewBodySchema,
} from './reviews.schema.js';

export const patientReviewsRouter: Router = Router();

patientReviewsRouter.use(requireAuth);

patientReviewsRouter.post(
  '/',
  validate({ body: submitReviewBodySchema }),
  reviewsController.submitReview,
);

patientReviewsRouter.get(
  '/',
  reviewsController.getPatientReviews,
);

patientReviewsRouter.put(
  '/:reviewId',
  validate({ body: updateReviewBodySchema }),
  reviewsController.updateReview,
);

patientReviewsRouter.get(
  '/eligibility/:appointmentId',
  reviewsController.getReviewEligibility,
);

export const adminReviewsRouter: Router = Router();

adminReviewsRouter.use(requireAuth);

adminReviewsRouter.get(
  '/doctor-summary',
  requirePermission('REVIEWS', 'read'),
  reviewsController.getDoctorRatingSummaries,
);

adminReviewsRouter.get(
  '/ratings-summary',
  requirePermission('REVIEWS', 'read'),
  reviewsController.getDoctorRatingSummaries,
);

adminReviewsRouter.get(
  '/',
  requirePermission('REVIEWS', 'read'),
  validate({ query: adminReviewsQuerySchema }),
  reviewsController.getAdminReviews,
);

adminReviewsRouter.get(
  '/:reviewId',
  requirePermission('REVIEWS', 'read'),
  reviewsController.getReviewDetails,
);


adminReviewsRouter.patch(
  '/:reviewId/status',
  requirePermission('REVIEWS', 'update'),
  validate({ body: moderateReviewBodySchema }),
  reviewsController.moderateReview,
);

adminReviewsRouter.post(
  '/:reviewId/moderate',
  requirePermission('REVIEWS', 'update'),
  validate({ body: moderateReviewBodySchema }),
  reviewsController.moderateReview,
);

export const adminDoctorsRouter: Router = Router();
adminDoctorsRouter.use(requireAuth);

adminDoctorsRouter.get(
  '/ratings-summary',
  requirePermission('REVIEWS', 'read'),
  reviewsController.getDoctorRatingSummaries,
);

export const doctorReviewsRouter: Router = Router();

doctorReviewsRouter.get(
  '/:doctorId/reviews',
  validate({ query: doctorReviewsQuerySchema }),
  reviewsController.getDoctorReviews,
);

/**
 * Top-level reviews router mounted in src/routes.ts
 */
export const reviewsRouter: Router = Router();

reviewsRouter.use('/patient/reviews', patientReviewsRouter);
reviewsRouter.get(
  '/patient/appointments/:appointmentId/review-eligibility',
  requireAuth,
  reviewsController.getReviewEligibility,
);
reviewsRouter.use('/admin/reviews', adminReviewsRouter);
reviewsRouter.use('/admin/doctors', adminDoctorsRouter);
reviewsRouter.get(
  '/admin/doctors/ratings-summary',
  requireAuth,
  requirePermission('REVIEWS', 'read'),
  reviewsController.getDoctorRatingSummaries,
);
reviewsRouter.use('/doctors', doctorReviewsRouter);
