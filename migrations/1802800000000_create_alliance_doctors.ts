/* eslint-disable */
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS alliance_doctors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(150),
      specialization VARCHAR(150),
      qualification VARCHAR(255),
      experience_years INTEGER,
      gender VARCHAR(50),
      mobile_number VARCHAR(50),
      alternate_mobile_number VARCHAR(50),
      email VARCHAR(255),
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(100),
      district VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100) DEFAULT 'India',
      pincode VARCHAR(20),
      hospital_clinic_name VARCHAR(255),
      registration_number VARCHAR(100),
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_name ON alliance_doctors(name);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_category ON alliance_doctors(category);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_specialization ON alliance_doctors(specialization);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_status ON alliance_doctors(status);
    CREATE INDEX IF NOT EXISTS idx_alliance_doctors_created_at ON alliance_doctors(created_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS alliance_doctors;
  `);
}

