import { pool } from '@/db/pool.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/http/errors.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

import {
  type AdminReviewsFilterParams,
  reviewsRepository,
} from './reviews.repository.js';
import type {
  DoctorRatingSummaryItem,
  DoctorReview,
  DoctorReviewsSummary,
  ModerationAction,
  PatientReviewHistoryItem,
  ReviewEligibilityResult,
} from './reviews.types.js';

export interface SubmitReviewInput {
  appointment_id: string;
  rating: number;
  review_comment?: string | null | undefined;
  communication_rating?: number | null | undefined;
  experience_rating?: number | null | undefined;
  professionalism_rating?: number | null | undefined;
  waiting_time_rating?: number | null | undefined;
  satisfaction_rating?: number | null | undefined;
}

export interface UpdateReviewInput {
  rating?: number | undefined;
  review_comment?: string | null | undefined;
  communication_rating?: number | null | undefined;
  experience_rating?: number | null | undefined;
  professionalism_rating?: number | null | undefined;
  waiting_time_rating?: number | null | undefined;
  satisfaction_rating?: number | null | undefined;
}

// Configurable review editing period (default 30 days)
const REVIEW_EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const reviewsService = {
  /**
   * Submit a new review for a completed appointment
   */
  async submitReview(patientUserId: string, input: SubmitReviewInput): Promise<DoctorReview> {
    // 1. Fetch appointment
    const apptRes = await pool.query(
      `SELECT a.*, d.name AS doctor_name
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = $1`,
      [input.appointment_id],
    );

    if (apptRes.rows.length === 0) {
      throw new NotFoundError('Appointment');
    }

    const appointment = apptRes.rows[0];

    // 2. Verify that the appointment belongs to the authenticated patient
    // Check if appointment.patient_id matches patientUserId or linked patient user account
    const isOwner =
      appointment.patient_id === patientUserId ||
      (await this.checkPatientOwnership(appointment.patient_id, patientUserId));

    if (!isOwner) {
      throw new ForbiddenError('You can only review your own appointments.');
    }

    // 3. Verify appointment status is 'completed'
    if (appointment.status !== 'completed') {
      throw new ValidationError(
        `Reviews can only be submitted for completed appointments. Current status is '${appointment.status}'.`,
      );
    }

    // 4. Verify duplicate reviews
    const existing = await reviewsRepository.getReviewByAppointmentId(input.appointment_id);
    if (existing) {
      throw new ConflictError('A review has already been submitted for this appointment.');
    }

    // 5. Insert review into database
    let createdReview: DoctorReview;
    try {
      createdReview = await reviewsRepository.createReview({
        appointmentId: appointment.id,
        patientId: appointment.patient_id, // Authenticated patient ID from appointment
        doctorId: appointment.doctor_id,   // Verified doctor ID from appointment
        rating: input.rating,
        reviewComment: input.review_comment,
        communicationRating: input.communication_rating,
        experienceRating: input.experience_rating,
        professionalismRating: input.professionalism_rating,
        waitingTimeRating: input.waiting_time_rating,
        satisfactionRating: input.satisfaction_rating,
      });
    } catch (err: any) {
      // Handle database duplicate key error safely
      if (err.code === '23505') {
        throw new ConflictError('A review has already been submitted for this appointment.');
      }
      throw err;
    }

    // 6. Asynchronously trigger notification without blocking review response
    void (async () => {
      try {
        await notificationService.sendToUser(appointment.patient_id, {
          type: 'APPOINTMENT_REVIEW_SUBMITTED',
          title: 'Feedback Received',
          body: `Thank you for reviewing Dr. ${appointment.doctor_name || 'Narendran'}. Your feedback helps improve care quality.`,
          entityType: 'review',
          entityId: createdReview.id,
          data: {
            appointmentId: appointment.id,
            doctorId: appointment.doctor_id,
            rating: String(input.rating),
          },
        });
      } catch (notifErr) {
        logger.warn({ notifErr, reviewId: createdReview.id }, 'Non-blocking notification delivery failed');
      }
    })();

    return createdReview;
  },

  /**
   * Get public reviews and ratings distribution for a doctor
   */
  async getDoctorReviews(
    doctorId: string,
    query: { page?: number; limit?: number; sort?: 'newest' | 'highest' | 'lowest' },
  ): Promise<DoctorReviewsSummary> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 && query.limit <= 50 ? query.limit : 10;
    const sort = query.sort || 'newest';

    return reviewsRepository.getDoctorReviews(doctorId, page, limit, sort);
  },

  /**
   * Get review history for the authenticated patient
   */
  async getPatientReviews(
    patientUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ reviews: PatientReviewHistoryItem[]; totalCount: number; totalPages: number }> {
    const result = await reviewsRepository.getPatientReviews(patientUserId, page, limit);

    const now = Date.now();
    const formattedReviews: PatientReviewHistoryItem[] = result.reviews.map(r => {
      const createdAtMs = new Date(r.created_at).getTime();
      const withinWindow = now - createdAtMs <= REVIEW_EDIT_WINDOW_MS;
      const can_edit = r.status === 'ACTIVE' && withinWindow;
      return {
        ...r,
        can_edit,
      };
    });

    return {
      reviews: formattedReviews,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    };
  },

  /**
   * Update an existing review by patient within allowed window
   */
  async updateReview(
    patientUserId: string,
    reviewId: string,
    input: UpdateReviewInput,
  ): Promise<DoctorReview> {
    const review = await reviewsRepository.getReviewById(reviewId);
    if (!review) {
      throw new NotFoundError('Review');
    }

    // Ownership check
    const isOwner =
      review.patient_id === patientUserId ||
      (await this.checkPatientOwnership(review.patient_id, patientUserId));

    if (!isOwner) {
      throw new ForbiddenError('You can only edit your own reviews.');
    }

    // Moderation check: only ACTIVE reviews can be edited
    if (review.status !== 'ACTIVE') {
      throw new ForbiddenError('This review has been moderated and cannot be edited.');
    }

    // Time window check (30 days)
    const createdAtMs = new Date(review.created_at).getTime();
    if (Date.now() - createdAtMs > REVIEW_EDIT_WINDOW_MS) {
      throw new ForbiddenError('The 30-day review editing window has expired.');
    }

    const updated = await reviewsRepository.updateReview(reviewId, {
      rating: input.rating,
      reviewComment: input.review_comment,
      communicationRating: input.communication_rating,
      experienceRating: input.experience_rating,
      professionalismRating: input.professionalism_rating,
      waitingTimeRating: input.waiting_time_rating,
      satisfactionRating: input.satisfaction_rating,
    });

    if (!updated) {
      throw new NotFoundError('Review');
    }

    return updated;
  },

  /**
   * Determine review eligibility for an appointment
   */
  async getReviewEligibility(
    patientUserId: string,
    appointmentId: string,
  ): Promise<ReviewEligibilityResult> {
    const apptRes = await pool.query(
      `SELECT id, patient_id, doctor_id, status FROM appointments WHERE id = $1`,
      [appointmentId],
    );

    if (apptRes.rows.length === 0) {
      return {
        eligible: false,
        already_reviewed: false,
        appointment_status: 'NOT_FOUND',
        can_edit: false,
        reason: 'Appointment does not exist.',
      };
    }

    const appointment = apptRes.rows[0];

    // Check ownership
    const isOwner =
      appointment.patient_id === patientUserId ||
      (await this.checkPatientOwnership(appointment.patient_id, patientUserId));

    if (!isOwner) {
      return {
        eligible: false,
        already_reviewed: false,
        appointment_status: appointment.status,
        can_edit: false,
        reason: 'Appointment belongs to another patient.',
      };
    }

    // Check existing review
    const existingReview = await reviewsRepository.getReviewByAppointmentId(appointmentId);
    if (existingReview) {
      const createdAtMs = new Date(existingReview.created_at).getTime();
      const can_edit =
        existingReview.status === 'ACTIVE' && Date.now() - createdAtMs <= REVIEW_EDIT_WINDOW_MS;

      return {
        eligible: false,
        already_reviewed: true,
        appointment_status: appointment.status,
        review_id: existingReview.id,
        can_edit,
        existing_review: existingReview,
        reason: 'Appointment has already been reviewed.',
      };
    }

    // Check appointment status
    if (appointment.status !== 'completed') {
      return {
        eligible: false,
        already_reviewed: false,
        appointment_status: appointment.status,
        can_edit: false,
        reason: `Only completed appointments are eligible for reviews. Current status is ${appointment.status}.`,
      };
    }

    return {
      eligible: true,
      already_reviewed: false,
      appointment_status: 'completed',
      can_edit: false,
      reason: null,
    };
  },

  /**
   * Admin: List reviews with filters and search
   */
  async getAdminReviews(params: AdminReviewsFilterParams) {
    return reviewsRepository.getAdminReviews(params);
  },

  /**
   * Admin: Get review details with full moderation log
   */
  async getReviewDetails(reviewId: string) {
    const review = await reviewsRepository.getReviewById(reviewId);
    if (!review) {
      throw new NotFoundError('Review');
    }
    const moderationLogs = await reviewsRepository.getModerationLogs(reviewId);
    return { review, moderationLogs };
  },

  /**
   * Admin: Moderate review (FLAG, HIDE, RESTORE)
   */
  async moderateReview(
    reviewId: string,
    adminId: string,
    action: ModerationAction,
    reason: string,
  ): Promise<DoctorReview> {
    const review = await reviewsRepository.getReviewById(reviewId);
    if (!review) {
      throw new NotFoundError('Review');
    }

    return reviewsRepository.moderateReview(reviewId, adminId, action, reason);
  },

  /**
   * Admin: Get doctor ratings summaries
   */
  async getDoctorRatingSummaries(doctorId?: string): Promise<DoctorRatingSummaryItem[]> {
    return reviewsRepository.getDoctorRatingSummaries(doctorId);
  },

  /**
   * Helper to verify if an appointment's patient_id maps to the user
   */
  async checkPatientOwnership(apptPatientId: string, userId: string): Promise<boolean> {
    if (apptPatientId === userId) return true;
    const { rows } = await pool.query(
      `SELECT 1 FROM patients WHERE (id = $1 AND user_account_id = $2) OR (user_account_id = $1 AND id = $2)`,
      [apptPatientId, userId],
    );
    return rows.length > 0;
  },
};
