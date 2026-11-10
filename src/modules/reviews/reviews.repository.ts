import { pool } from '@/db/pool.js';
import type {
  DoctorRatingSummaryItem,
  DoctorReview,
  DoctorReviewsSummary,
  ModerationAction,
  ReviewModerationLog,
  ReviewRatingDistribution,
  ReviewStatus,
} from './reviews.types.js';

export interface CreateReviewParams {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  rating: number;
  reviewComment?: string | null | undefined;
  communicationRating?: number | null | undefined;
  experienceRating?: number | null | undefined;
  professionalismRating?: number | null | undefined;
  waitingTimeRating?: number | null | undefined;
  satisfactionRating?: number | null | undefined;
}

export interface UpdateReviewParams {
  rating?: number | undefined;
  reviewComment?: string | null | undefined;
  communicationRating?: number | null | undefined;
  experienceRating?: number | null | undefined;
  professionalismRating?: number | null | undefined;
  waitingTimeRating?: number | null | undefined;
  satisfactionRating?: number | null | undefined;
}

export interface AdminReviewsFilterParams {
  page: number;
  limit: number;
  doctorId?: string | undefined;
  rating?: number | undefined;
  status?: string | undefined;
  search?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

function maskPatientName(name?: string | null): string {
  if (!name || name.trim().length === 0) return 'Verified Patient';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const single = parts[0]!;
    return single.length > 2 ? `${single.slice(0, 2)}***` : 'Verified Patient';
  }
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0]!.toUpperCase();
  return `${first} ${lastInitial}.`;
}

export const reviewsRepository = {
  /**
   * Insert a new doctor review
   */
  async createReview(params: CreateReviewParams): Promise<DoctorReview> {
    const query = `
      INSERT INTO doctor_reviews (
        appointment_id,
        patient_id,
        doctor_id,
        rating,
        review_comment,
        communication_rating,
        experience_rating,
        professionalism_rating,
        waiting_time_rating,
        satisfaction_rating,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
      RETURNING *;
    `;
    const values = [
      params.appointmentId,
      params.patientId,
      params.doctorId,
      params.rating,
      params.reviewComment || null,
      params.communicationRating || null,
      params.experienceRating || null,
      params.professionalismRating || null,
      params.waitingTimeRating || null,
      params.satisfactionRating || null,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  /**
   * Get review by primary key ID
   */
  async getReviewById(id: string): Promise<DoctorReview | null> {
    const query = `
      SELECT 
        r.*,
        d.name AS doctor_name,
        d.specialization AS doctor_specialty,
        d.profile_image_url AS doctor_image_url,
        COALESCE(p.name, u.username, 'Patient') AS patient_name,
        a.scheduled_start AS appointment_date,
        a.token_number
      FROM doctor_reviews r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN user_accounts u ON r.patient_id = u.id
      LEFT JOIN patients p ON (p.user_account_id = u.id OR p.id = u.id)
      JOIN appointments a ON r.appointment_id = a.id
      WHERE r.id = $1
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  /**
   * Get review by appointment ID
   */
  async getReviewByAppointmentId(appointmentId: string): Promise<DoctorReview | null> {
    const query = `
      SELECT 
        r.*,
        d.name AS doctor_name,
        d.specialization AS doctor_specialty,
        d.profile_image_url AS doctor_image_url,
        a.scheduled_start AS appointment_date,
        a.token_number
      FROM doctor_reviews r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN appointments a ON r.appointment_id = a.id
      WHERE r.appointment_id = $1
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [appointmentId]);
    return rows[0] || null;
  },

  /**
   * Update an existing patient review
   */
  async updateReview(id: string, params: UpdateReviewParams): Promise<DoctorReview | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [id];
    let idx = 2;

    if (params.rating !== undefined) {
      updates.push(`rating = $${idx++}`);
      values.push(params.rating);
    }
    if (params.reviewComment !== undefined) {
      updates.push(`review_comment = $${idx++}`);
      values.push(params.reviewComment);
    }
    if (params.communicationRating !== undefined) {
      updates.push(`communication_rating = $${idx++}`);
      values.push(params.communicationRating);
    }
    if (params.experienceRating !== undefined) {
      updates.push(`experience_rating = $${idx++}`);
      values.push(params.experienceRating);
    }
    if (params.professionalismRating !== undefined) {
      updates.push(`professionalism_rating = $${idx++}`);
      values.push(params.professionalismRating);
    }
    if (params.waitingTimeRating !== undefined) {
      updates.push(`waiting_time_rating = $${idx++}`);
      values.push(params.waitingTimeRating);
    }
    if (params.satisfactionRating !== undefined) {
      updates.push(`satisfaction_rating = $${idx++}`);
      values.push(params.satisfactionRating);
    }

    const query = `
      UPDATE doctor_reviews
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(query, values);
    return rows[0] || null;
  },

  /**
   * Get public reviews for a doctor with metrics and distribution (ACTIVE only)
   */
  async getDoctorReviews(
    doctorId: string,
    page: number = 1,
    limit: number = 10,
    sort: 'newest' | 'highest' | 'lowest' = 'newest',
  ): Promise<DoctorReviewsSummary> {
    const offset = (page - 1) * limit;

    // 1. Fetch aggregates: Average rating, total count, star breakdown
    const statsQuery = `
      SELECT 
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0) AS average_rating,
        COUNT(*)::int AS total_reviews,
        COUNT(*) FILTER (WHERE rating = 5)::int AS star5,
        COUNT(*) FILTER (WHERE rating = 4)::int AS star4,
        COUNT(*) FILTER (WHERE rating = 3)::int AS star3,
        COUNT(*) FILTER (WHERE rating = 2)::int AS star2,
        COUNT(*) FILTER (WHERE rating = 1)::int AS star1
      FROM doctor_reviews
      WHERE (doctor_id = $1 OR doctor_id = (SELECT id FROM doctors WHERE user_account_id = $1 LIMIT 1))
        AND status = 'ACTIVE';
    `;
    const statsRes = await pool.query(statsQuery, [doctorId]);
    const stats = statsRes.rows[0] || {
      average_rating: 0,
      total_reviews: 0,
      star5: 0,
      star4: 0,
      star3: 0,
      star2: 0,
      star1: 0,
    };

    // 2. Sorting clause
    let orderBy = 'r.created_at DESC';
    if (sort === 'highest') {
      orderBy = 'r.rating DESC, r.created_at DESC';
    } else if (sort === 'lowest') {
      orderBy = 'r.rating ASC, r.created_at DESC';
    }

    // 3. Query individual ACTIVE reviews with masked patient identity
    const reviewsQuery = `
      SELECT 
        r.id,
        r.appointment_id,
        r.doctor_id,
        r.rating,
        r.review_comment,
        r.communication_rating,
        r.experience_rating,
        r.professionalism_rating,
        r.waiting_time_rating,
        r.satisfaction_rating,
        r.created_at,
        r.updated_at,
        COALESCE(p.name, u.username, 'Patient') AS raw_patient_name
      FROM doctor_reviews r
      JOIN user_accounts u ON r.patient_id = u.id
      LEFT JOIN patients p ON (p.user_account_id = u.id OR p.id = u.id)
      WHERE (r.doctor_id = $1 OR r.doctor_id = (SELECT id FROM doctors WHERE user_account_id = $1 LIMIT 1))
        AND r.status = 'ACTIVE'
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3;
    `;
    const { rows: reviewRows } = await pool.query(reviewsQuery, [doctorId, limit, offset]);

    const formattedReviews: DoctorReview[] = reviewRows.map(r => ({
      ...r,
      patient_name: maskPatientName(r.raw_patient_name),
      status: 'ACTIVE' as ReviewStatus,
    }));

    const totalCount = Number(stats.total_reviews) || 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      doctorId,
      averageRating: Number(stats.average_rating) || 0,
      totalReviews: totalCount,
      distribution: {
        star5: Number(stats.star5) || 0,
        star4: Number(stats.star4) || 0,
        star3: Number(stats.star3) || 0,
        star2: Number(stats.star2) || 0,
        star1: Number(stats.star1) || 0,
      },
      reviews: formattedReviews,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount,
      },
    };
  },

  /**
   * Get review history for authenticated patient
   */
  async getPatientReviews(
    patientUserAccountId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ reviews: DoctorReview[]; totalCount: number; totalPages: number }> {
    const offset = (page - 1) * limit;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM doctor_reviews
      WHERE patient_id = $1
         OR patient_id IN (SELECT user_account_id FROM patients WHERE id = $1)
         OR patient_id IN (SELECT id FROM patients WHERE user_account_id = $1);
    `;
    const countRes = await pool.query(countQuery, [patientUserAccountId]);
    const totalCount = countRes.rows[0]?.total || 0;

    const query = `
      SELECT 
        r.*,
        d.name AS doctor_name,
        d.specialization AS doctor_specialty,
        d.profile_image_url AS doctor_image_url,
        a.scheduled_start AS appointment_date,
        a.token_number
      FROM doctor_reviews r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN appointments a ON r.appointment_id = a.id
      WHERE r.patient_id = $1
         OR r.patient_id IN (SELECT user_account_id FROM patients WHERE id = $1)
         OR r.patient_id IN (SELECT id FROM patients WHERE user_account_id = $1)
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const { rows } = await pool.query(query, [patientUserAccountId, limit, offset]);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    return { reviews: rows, totalCount, totalPages };
  },

  /**
   * Centralized admin query with dynamic filters and pagination
   */
  async getAdminReviews(params: AdminReviewsFilterParams): Promise<{
    reviews: DoctorReview[];
    totalCount: number;
    totalPages: number;
  }> {
    const { page, limit, doctorId, rating, status, search, startDate, endDate } = params;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (doctorId) {
      conditions.push(`r.doctor_id = $${idx++}`);
      values.push(doctorId);
    }
    if (rating) {
      conditions.push(`r.rating = $${idx++}`);
      values.push(rating);
    }
    if (status && status !== 'ALL') {
      conditions.push(`r.status = $${idx++}`);
      values.push(status);
    }
    if (startDate) {
      conditions.push(`r.created_at >= $${idx++}::timestamptz`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`r.created_at <= $${idx++}::timestamptz`);
      values.push(endDate);
    }
    if (search && search.trim().length > 0) {
      conditions.push(`(
        d.name ILIKE $${idx}
        OR COALESCE(p.name, u.username) ILIKE $${idx}
        OR r.appointment_id::text ILIKE $${idx}
        OR r.review_comment ILIKE $${idx}
      )`);
      values.push(`%${search.trim()}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM doctor_reviews r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN user_accounts u ON r.patient_id = u.id
      LEFT JOIN patients p ON (p.user_account_id = u.id OR p.id = u.id)
      WHERE ${whereClause};
    `;
    const countRes = await pool.query(countQuery, values);
    const totalCount = countRes.rows[0]?.total || 0;

    const listQuery = `
      SELECT 
        r.*,
        d.name AS doctor_name,
        d.specialization AS doctor_specialty,
        d.profile_image_url AS doctor_image_url,
        COALESCE(p.name, u.username, 'Patient') AS patient_name,
        a.scheduled_start AS appointment_date,
        a.token_number
      FROM doctor_reviews r
      JOIN doctors d ON r.doctor_id = d.id
      JOIN user_accounts u ON r.patient_id = u.id
      LEFT JOIN patients p ON (p.user_account_id = u.id OR p.id = u.id)
      JOIN appointments a ON r.appointment_id = a.id
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    values.push(limit, offset);

    const { rows } = await pool.query(listQuery, values);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    return { reviews: rows, totalCount, totalPages };
  },

  /**
   * Admin status update with moderation logging in a transaction
   */
  async moderateReview(
    reviewId: string,
    adminId: string,
    action: ModerationAction,
    reason: string,
  ): Promise<DoctorReview> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let targetStatus: ReviewStatus = 'ACTIVE';
      if (action === 'HIDE') targetStatus = 'HIDDEN';
      else if (action === 'FLAG') targetStatus = 'FLAGGED';
      else if (action === 'RESTORE') targetStatus = 'ACTIVE';

      // 1. Insert moderation log
      await client.query(
        `INSERT INTO doctor_review_moderation_logs (review_id, admin_id, action, reason)
         VALUES ($1, $2, $3, $4)`,
        [reviewId, adminId, action, reason],
      );

      // 2. Update review status & moderation metadata
      const updateRes = await client.query(
        `UPDATE doctor_reviews
         SET status = $1,
             moderated_by = $2,
             moderated_at = NOW(),
             moderation_action = $3,
             moderation_reason = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *;`,
        [targetStatus, adminId, action, reason, reviewId],
      );

      if (updateRes.rows.length === 0) {
        throw new Error('Review not found');
      }

      await client.query('COMMIT');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Get moderation audit history for a review
   */
  async getModerationLogs(reviewId: string): Promise<ReviewModerationLog[]> {
    const query = `
      SELECT 
        l.*,
        u.username AS admin_name
      FROM doctor_review_moderation_logs l
      LEFT JOIN user_accounts u ON l.admin_id = u.id
      WHERE l.review_id = $1
      ORDER BY l.created_at DESC;
    `;
    const { rows } = await pool.query(query, [reviewId]);
    return rows;
  },

  /**
   * Doctor-wise rating summary for Admin Dashboard (optionally for a single doctor)
   */
  async getDoctorRatingSummaries(doctorId?: string): Promise<DoctorRatingSummaryItem[]> {
    const whereClause = doctorId ? 'WHERE (d.id = $1 OR d.user_account_id = $1)' : '';
    const params = doctorId ? [doctorId] : [];
    const query = `
      SELECT 
        d.id AS "doctorId",
        d.name AS "doctorName",
        d.specialization,
        d.profile_image_url AS "profileImageUrl",
        COALESCE(ROUND(AVG(r.rating) FILTER (WHERE r.status = 'ACTIVE')::numeric, 1), 0.0) AS "averageRating",
        COUNT(r.id)::int AS "totalReviews",
        COUNT(r.id) FILTER (WHERE r.status = 'ACTIVE')::int AS "activeReviews",
        COUNT(r.id) FILTER (WHERE r.status = 'HIDDEN')::int AS "hiddenReviews",
        COUNT(r.id) FILTER (WHERE r.status = 'FLAGGED')::int AS "flaggedReviews",
        COUNT(r.id) FILTER (WHERE r.rating = 5 AND r.status = 'ACTIVE')::int AS star5,
        COUNT(r.id) FILTER (WHERE r.rating = 4 AND r.status = 'ACTIVE')::int AS star4,
        COUNT(r.id) FILTER (WHERE r.rating = 3 AND r.status = 'ACTIVE')::int AS star3,
        COUNT(r.id) FILTER (WHERE r.rating = 2 AND r.status = 'ACTIVE')::int AS star2,
        COUNT(r.id) FILTER (WHERE r.rating = 1 AND r.status = 'ACTIVE')::int AS star1
      FROM doctors d
      LEFT JOIN doctor_reviews r ON (r.doctor_id = d.id OR r.doctor_id = d.user_account_id)
      ${whereClause}
      GROUP BY d.id, d.name, d.specialization, d.profile_image_url
      ORDER BY "totalReviews" DESC, "averageRating" DESC;
    `;
    const { rows } = await pool.query(query, params);

    return rows.map(r => ({
      doctorId: r.doctorId,
      doctorName: r.doctorName,
      specialization: r.specialization,
      profileImageUrl: r.profileImageUrl,
      averageRating: Number(r.averageRating) || 0,
      totalReviews: Number(r.totalReviews) || 0,
      activeReviews: Number(r.activeReviews) || 0,
      hiddenReviews: Number(r.hiddenReviews) || 0,
      flaggedReviews: Number(r.flaggedReviews) || 0,
      distribution: {
        star5: Number(r.star5) || 0,
        star4: Number(r.star4) || 0,
        star3: Number(r.star3) || 0,
        star2: Number(r.star2) || 0,
        star1: Number(r.star1) || 0,
      },
    }));
  },
};
