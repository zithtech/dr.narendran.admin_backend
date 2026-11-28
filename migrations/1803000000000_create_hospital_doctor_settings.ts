import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS hospital_doctor_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      prefix VARCHAR(3) NOT NULL DEFAULT 'DOC',
      next_sequence INTEGER NOT NULL DEFAULT 1,
      numeric_length INTEGER NOT NULL DEFAULT 6,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_hospital_doctor_settings_hospital UNIQUE (hospital_id)
    );

    ALTER TABLE doctors
      ADD COLUMN IF NOT EXISTS doctor_code VARCHAR(50);

    -- Assign sequential Doctor Codes to existing doctors ordered chronologically
    DO $$
    DECLARE
      d_record RECORD;
      counter INT := 1;
      code_str VARCHAR(50);
    BEGIN
      FOR d_record IN (
        SELECT id FROM doctors WHERE doctor_code IS NULL ORDER BY created_at ASC
      ) LOOP
        code_str := 'DOC' || LPAD(counter::TEXT, 6, '0');
        UPDATE doctors SET doctor_code = code_str WHERE id = d_record.id;
        counter := counter + 1;
      END LOOP;

      -- Seed hospital_doctor_settings for all hospitals with next_sequence = counter
      INSERT INTO hospital_doctor_settings (hospital_id, prefix, next_sequence, numeric_length)
      SELECT h.id, 'DOC', GREATEST(counter, 1), 6
      FROM hospitals h
      ON CONFLICT (hospital_id) DO UPDATE
        SET next_sequence = GREATEST(hospital_doctor_settings.next_sequence, counter);
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_doctor_code ON doctors(doctor_code);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_doctors_doctor_code;
    ALTER TABLE doctors DROP COLUMN IF EXISTS doctor_code;
    DROP TABLE IF EXISTS hospital_doctor_settings;
  `);
}
