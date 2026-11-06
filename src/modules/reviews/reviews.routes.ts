import { Router } from 'express';

import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
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
adminReviewsRouter.use(requireRole('admin'));

adminReviewsRouter.get(
  '/doctor-summary',
  reviewsController.getDoctorRatingSummaries,
);

adminReviewsRouter.get(
  '/ratings-summary',
  reviewsController.getDoctorRatingSummaries,
);

adminReviewsRouter.get(
  '/',
  validate({ query: adminReviewsQuerySchema }),
  reviewsController.getAdminReviews,
);

adminReviewsRouter.get(
  '/:reviewId',
  reviewsController.getReviewDetails,
);


adminReviewsRouter.patch(
  '/:reviewId/status',
  validate({ body: moderateReviewBodySchema }),
  reviewsController.moderateReview,
);

adminReviewsRouter.post(
  '/:reviewId/moderate',
  validate({ body: moderateReviewBodySchema }),
  reviewsController.moderateReview,
);

export const adminDoctorsRouter: Router = Router();
adminDoctorsRouter.use(requireAuth);
adminDoctorsRouter.use(requireRole('admin'));

adminDoctorsRouter.get(
  '/ratings-summary',
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
  requireRole('admin'),
  reviewsController.getDoctorRatingSummaries,
);
reviewsRouter.use('/doctors', doctorReviewsRouter);
