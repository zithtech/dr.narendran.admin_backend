export type ReviewStatus = 'ACTIVE' | 'HIDDEN' | 'FLAGGED';

export type ModerationAction = 'FLAG' | 'HIDE' | 'RESTORE';

export interface DoctorReview {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  rating: number;
  review_comment?: string | null | undefined;
  communication_rating?: number | null | undefined;
  experience_rating?: number | null | undefined;
  professionalism_rating?: number | null | undefined;
  waiting_time_rating?: number | null | undefined;
  satisfaction_rating?: number | null | undefined;
  status: ReviewStatus;
  moderated_by?: string | null | undefined;
  moderated_at?: string | null | undefined;
  moderation_action?: string | null | undefined;
  moderation_reason?: string | null | undefined;
  created_at: string;
  updated_at: string;

  // Joined metadata
  doctor_name?: string | undefined;
  doctor_specialty?: string | undefined;
  doctor_image_url?: string | null | undefined;
  patient_name?: string | undefined;
  appointment_date?: string | undefined;
  token_number?: string | undefined;
}

export interface ReviewRatingDistribution {
  star5: number;
  star4: number;
  star3: number;
  star2: number;
  star1: number;
}

export interface DoctorReviewsSummary {
  doctorId: string;
  averageRating: number;
  totalReviews: number;
  distribution: ReviewRatingDistribution;
  reviews: DoctorReview[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
  };
}

export interface PatientReviewHistoryItem extends DoctorReview {
  can_edit: boolean;
}

export interface ReviewEligibilityResult {
  eligible: boolean;
  already_reviewed: boolean;
  appointment_status: string;
  review_id?: string | null | undefined;
  can_edit: boolean;
  existing_review?: DoctorReview | null | undefined;
  reason?: string | null | undefined;
}

export interface ReviewModerationLog {
  id: string;
  review_id: string;
  admin_id: string;
  admin_name?: string | undefined;
  action: ModerationAction;
  reason: string;
  created_at: string;
}

export interface DoctorRatingSummaryItem {
  doctorId: string;
  doctorName: string;
  specialization?: string | null | undefined;
  profileImageUrl?: string | null | undefined;
  averageRating: number;
  totalReviews: number;
  activeReviews: number;
  hiddenReviews: number;
  flaggedReviews: number;
  distribution: ReviewRatingDistribution;
}
