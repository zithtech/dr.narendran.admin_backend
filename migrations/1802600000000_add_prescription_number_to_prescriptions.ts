import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
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
