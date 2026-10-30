import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS podcast_url TEXT;

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
        ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS podcast_url TEXT;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE doctors DROP COLUMN IF EXISTS podcast_url;

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
        ALTER TABLE doctor_profiles DROP COLUMN IF EXISTS podcast_url;
      END IF;
    END $$;
  `);
}
