import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE hospital_staff
    ADD COLUMN IF NOT EXISTS work_days VARCHAR(255) DEFAULT 'Mon,Tue,Wed,Thu,Fri';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE hospital_staff
    DROP COLUMN IF EXISTS work_days;
  `);
}

