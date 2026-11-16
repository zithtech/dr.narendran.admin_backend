import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE lab_services
    ADD COLUMN IF NOT EXISTS service_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS service_category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sample_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT 0;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE lab_services
    DROP COLUMN IF EXISTS service_code,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS service_category,
    DROP COLUMN IF EXISTS sample_type;
  `);
}
