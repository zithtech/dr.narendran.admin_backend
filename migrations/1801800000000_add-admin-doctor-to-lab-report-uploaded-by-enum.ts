import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Safely add ADMIN and DOCTOR to the existing lab_report_uploaded_by_enum
  pgm.sql("ALTER TYPE lab_report_uploaded_by_enum ADD VALUE IF NOT EXISTS 'ADMIN';");
  pgm.sql("ALTER TYPE lab_report_uploaded_by_enum ADD VALUE IF NOT EXISTS 'DOCTOR';");
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // In PostgreSQL, dropping an enum value requires recreating the enum type,
  // which is unsafe if existing rows use the values. Leaving as no-op.
}

