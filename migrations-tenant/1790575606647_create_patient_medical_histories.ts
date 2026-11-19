/* eslint-disable */
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS occupation VARCHAR(150);
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS patient_medical_histories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
      recorded_by_id UUID,
      recorded_by_name VARCHAR(255),
      notes TEXT,
      previous_medical_history JSONB NOT NULL DEFAULT '{}'::jsonb,
      family_medical_history JSONB NOT NULL DEFAULT '{}'::jsonb,
      reproductive_history JSONB NOT NULL DEFAULT '{}'::jsonb,
      lifestyle_history JSONB NOT NULL DEFAULT '{}'::jsonb,
      current_medical_info JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_patient_medical_histories_patient_id 
      ON patient_medical_histories(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_medical_histories_recorded_date 
      ON patient_medical_histories(recorded_date DESC);
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS patient_medical_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      medical_history_id UUID REFERENCES patient_medical_histories(id) ON DELETE SET NULL,
      document_type VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_url TEXT NOT NULL,
      storage_key TEXT,
      file_type VARCHAR(100),
      file_size BIGINT,
      document_date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      uploaded_by_id UUID,
      uploaded_by_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_patient_medical_docs_patient_id 
      ON patient_medical_documents(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_medical_docs_type 
      ON patient_medical_documents(document_type);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS patient_medical_documents;
    DROP TABLE IF EXISTS patient_medical_histories;
    ALTER TABLE patients DROP COLUMN IF EXISTS occupation;
  `);
}
