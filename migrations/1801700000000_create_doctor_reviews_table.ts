import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- Create doctor_reviews table
    CREATE TABLE IF NOT EXISTS doctor_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review_comment TEXT NULL,
      
      -- Optional category-specific ratings (1-5)
      communication_rating INTEGER NULL CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
      experience_rating INTEGER NULL CHECK (experience_rating IS NULL OR (experience_rating >= 1 AND experience_rating <= 5)),
      professionalism_rating INTEGER NULL CHECK (professionalism_rating IS NULL OR (professionalism_rating >= 1 AND professionalism_rating <= 5)),
      waiting_time_rating INTEGER NULL CHECK (waiting_time_rating IS NULL OR (waiting_time_rating >= 1 AND waiting_time_rating <= 5)),
      satisfaction_rating INTEGER NULL CHECK (satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)),

      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'HIDDEN', 'FLAGGED')),
      
      -- Moderation tracking
      moderated_by UUID NULL REFERENCES user_accounts(id) ON DELETE SET NULL,
      moderated_at TIMESTAMP WITH TIME ZONE NULL,
      moderation_action VARCHAR(50) NULL,
      moderation_reason TEXT NULL,

      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

      -- Enforce one review per appointment at the database level
      CONSTRAINT uq_doctor_reviews_appointment UNIQUE (appointment_id)
    );

    -- Indexes for high-performance querying
    CREATE INDEX IF NOT EXISTS idx_doctor_reviews_doctor_status ON doctor_reviews(doctor_id, status) WHERE status = 'ACTIVE';
    CREATE INDEX IF NOT EXISTS idx_doctor_reviews_patient_id ON doctor_reviews(patient_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_reviews_appointment_id ON doctor_reviews(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_reviews_created_at ON doctor_reviews(created_at DESC);

    -- Moderation audit logs table
    CREATE TABLE IF NOT EXISTS doctor_review_moderation_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL REFERENCES doctor_reviews(id) ON DELETE CASCADE,
      admin_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL CHECK (action IN ('FLAG', 'HIDE', 'RESTORE')),
      reason TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_review_mod_logs_review_id ON doctor_review_moderation_logs(review_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS doctor_review_moderation_logs;
    DROP TABLE IF EXISTS doctor_reviews;
  `);
}
