 
import type {MigrationBuilder} from 'node-pg-migrate';

export const shorthands = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE specialties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL
    )
  `);

  pgm.sql(`
    CREATE TABLE doctor_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      qualifications TEXT,
      specialty_id UUID REFERENCES specialties(id),
      clinic_name TEXT,
      clinic_address TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      profile_image_url TEXT,
      registration_number TEXT,
      experience_years INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Seed default specialties
  pgm.sql(`
    INSERT INTO specialties (name) VALUES 
      ('Medical Oncology'),
      ('Radiation Oncology'),
      ('Palliative Care'),
      ('Surgical Oncology'),
      ('Hematology'),
      ('General Medicine')
    ON CONFLICT (name) DO NOTHING
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`DROP TABLE IF EXISTS doctor_profiles`);
  pgm.sql(`DROP TABLE IF EXISTS specialties`);
}
