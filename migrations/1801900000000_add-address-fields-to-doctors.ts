import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
        ALTER TABLE doctor_profiles 
          ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255),
          ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255),
          ADD COLUMN IF NOT EXISTS city VARCHAR(100),
          ADD COLUMN IF NOT EXISTS state VARCHAR(100),
          ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE doctors
    DROP COLUMN IF EXISTS address_line_1,
    DROP COLUMN IF EXISTS address_line_2,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS state,
    DROP COLUMN IF EXISTS pincode;

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
        ALTER TABLE doctor_profiles 
          DROP COLUMN IF EXISTS address_line_1,
          DROP COLUMN IF EXISTS address_line_2,
          DROP COLUMN IF EXISTS city,
          DROP COLUMN IF EXISTS state,
          DROP COLUMN IF EXISTS pincode;
      END IF;
    END $$;
  `);
}

