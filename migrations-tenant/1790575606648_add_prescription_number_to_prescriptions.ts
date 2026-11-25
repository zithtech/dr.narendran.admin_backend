import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
      appointment_id UUID,
      prescription_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      additional_notes TEXT,
      prescription_type VARCHAR(50) DEFAULT 'system',
      image_url TEXT,
      prescription_url TEXT,
      follow_up_days INT,
      follow_up_date DATE,
      follow_up_status VARCHAR(50),
      prescription_number VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS prescription_number VARCHAR(64);

    CREATE INDEX IF NOT EXISTS idx_prescriptions_prescription_number ON prescriptions (prescription_number);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_prescriptions_prescription_number;
    ALTER TABLE prescriptions
    DROP COLUMN IF EXISTS prescription_number;
  `);
}
