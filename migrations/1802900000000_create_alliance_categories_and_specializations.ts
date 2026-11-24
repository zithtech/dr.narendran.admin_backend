/* eslint-disable */
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS alliance_doctor_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_name ON alliance_doctor_categories(name);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_status ON alliance_doctor_categories(status);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_cat_created_at ON alliance_doctor_categories(created_at DESC);

    CREATE TABLE IF NOT EXISTS alliance_doctor_specializations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alliance_doc_spec_name ON alliance_doctor_specializations(name);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_spec_status ON alliance_doctor_specializations(status);
    CREATE INDEX IF NOT EXISTS idx_alliance_doc_spec_created_at ON alliance_doctor_specializations(created_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS alliance_doctor_specializations;
    DROP TABLE IF EXISTS alliance_doctor_categories;
  `);
}

