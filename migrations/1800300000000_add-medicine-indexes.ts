import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_medicines_medicine_code 
      ON medicines (lower(trim(medicine_code))) 
      WHERE medicine_code IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_medicines_name_lower 
      ON medicines (lower(trim(medicine_name)));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_medicines_medicine_code;
    DROP INDEX IF EXISTS idx_medicines_name_lower;
  `);
}
