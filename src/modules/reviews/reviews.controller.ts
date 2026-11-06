import type { Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';

import { reviewsService } from './reviews.service.js';

export const reviewsController = {
  /**
   * Patient: Submit review for a completed appointment
   * POST /api/patient/reviews
   */
  async submitReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const body = (req as any).validated?.body ?? req.body;
    const review = await reviewsService.submitReview(req.user.id, body);
    res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully.',
      data: review,
    });
  },

  /**
   * Public: Get doctor reviews & rating distribution
   * GET /api/doctors/:doctorId/reviews
   */
  async getDoctorReviews(req: Request, res: Response): Promise<void> {
    const doctorId = String(req.params['doctorId'] || req.params['id'] || '');
    if (!doctorId) {
      res.status(400).json({ status: 'error', message: 'Doctor ID is required' });
      return;
    }

    const query = (req as any).validated?.query ?? req.query;
    const summary = await reviewsService.getDoctorReviews(doctorId, query as any);
    res.status(200).json({
      status: 'success',
      data: summary,
    });
  },

  /**
   * Patient: Get authenticated patient's review history
   * GET /api/patient/reviews
   */
  async getPatientReviews(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const page = req.query['page'] ? Number(req.query['page']) : 1;
    const limit = req.query['limit'] ? Number(req.query['limit']) : 20;

    const result = await reviewsService.getPatientReviews(req.user.id, page, limit);
    res.status(200).json({
      status: 'success',
      data: result.reviews,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  },

  /**
   * Patient: Update an existing review within 30 days
   * PUT /api/patient/reviews/:reviewId
   */
  async updateReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const reviewId = String(req.params['reviewId'] || '');
    if (!reviewId) {
      res.status(400).json({ status: 'error', message: 'Review ID is required' });
      return;
    }

    const body = (req as any).validated?.body ?? req.body;
    const updated = await reviewsService.updateReview(req.user.id, reviewId, body);
    res.status(200).json({
      status: 'success',
      message: 'Review updated successfully.',
      data: updated,
    });
  },

  /**
   * Patient: Check review eligibility for an appointment
   * GET /api/patient/appointments/:appointmentId/review-eligibility
   */
  async getReviewEligibility(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const appointmentId = String(req.params['appointmentId'] || req.params['id'] || '');
    if (!appointmentId) {
      res.status(400).json({ status: 'error', message: 'Appointment ID is required' });
      return;
    }

    const eligibility = await reviewsService.getReviewEligibility(req.user.id, appointmentId);
    res.status(200).json({
      status: 'success',
      data: eligibility,
    });
  },

  /**
   * Admin: List all reviews with filters & search
   * GET /api/admin/reviews
   */
  async getAdminReviews(req: Request, res: Response): Promise<void> {
    const query = (req as any).validated?.query ?? req.query;
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 15;
    const doctorId = query.doctor_id as string | undefined;
    const rating = query.rating ? Number(query.rating) : undefined;
    const status = (query.status as string) || 'ALL';
    const search = query.search as string | undefined;
    const startDate = query.startDate as string | undefined;
    const endDate = query.endDate as string | undefined;

    const result = await reviewsService.getAdminReviews({
      page,
      limit,
      doctorId,
      rating,
      status,
      search,
      startDate,
      endDate,
    });

    res.status(200).json({
      status: 'success',
      data: result.reviews,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  },

  /**
   * Admin: Get full review details and audit logs
   * GET /api/admin/reviews/:reviewId
   */
  async getReviewDetails(req: Request, res: Response): Promise<void> {
    const reviewId = String(req.params['reviewId'] || '');
    if (!reviewId) {
      res.status(400).json({ status: 'error', message: 'Review ID is required' });
      return;
    }

    const details = await reviewsService.getReviewDetails(reviewId);
    res.status(200).json({
      status: 'success',
      data: details,
    });
  },

  /**
   * Admin: Moderate review (FLAG, HIDE, RESTORE)
   * POST /api/admin/reviews/:reviewId/moderate
   */
  async moderateReview(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const reviewId = String(req.params['reviewId'] || '');
    if (!reviewId) {
      res.status(400).json({ status: 'error', message: 'Review ID is required' });
      return;
    }

    const body = (req as any).validated?.body ?? req.body;
    const { action, reason } = body;
    const moderated = await reviewsService.moderateReview(
      reviewId,
      req.user.id,
      action,
      reason,
    );

    res.status(200).json({
      status: 'success',
      message: `Review successfully ${action === 'HIDE' ? 'hidden' : action === 'FLAG' ? 'flagged' : 'restored'}.`,
      data: moderated,
    });
  },

  /**
   * Admin: Get doctor ratings summaries
   * GET /api/admin/reviews/doctor-summary
   */
  async getDoctorRatingSummaries(_req: Request, res: Response): Promise<void> {
    const summaries = await reviewsService.getDoctorRatingSummaries();
    res.status(200).json({
      status: 'success',
      data: summaries,
    });
  },
};
