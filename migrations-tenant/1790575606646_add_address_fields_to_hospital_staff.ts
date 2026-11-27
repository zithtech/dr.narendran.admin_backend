/* eslint-disable */
// @ts-nocheck
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS hospital_staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(255),
      address TEXT,
      role VARCHAR(100) NOT NULL,
      hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
      branch_id UUID REFERENCES hospital_branches(id) ON DELETE SET NULL,
      shift_timing VARCHAR(100) NOT NULL DEFAULT 'Morning',
      custom_shift_details VARCHAR(255),
      work_days VARCHAR(255) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
      joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      documents JSONB NOT NULL DEFAULT '[]'::jsonb,
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hospital_staff_hospital ON hospital_staff(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_branch ON hospital_staff(branch_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_role ON hospital_staff(role);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_status ON hospital_staff(status);

    ALTER TABLE hospital_staff ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);
    ALTER TABLE hospital_staff ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);
    ALTER TABLE hospital_staff ADD COLUMN IF NOT EXISTS city VARCHAR(100);
    ALTER TABLE hospital_staff ADD COLUMN IF NOT EXISTS state VARCHAR(100);
    ALTER TABLE hospital_staff ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE hospital_staff DROP COLUMN IF EXISTS address_line_1;
    ALTER TABLE hospital_staff DROP COLUMN IF EXISTS address_line_2;
    ALTER TABLE hospital_staff DROP COLUMN IF EXISTS city;
    ALTER TABLE hospital_staff DROP COLUMN IF EXISTS state;
    ALTER TABLE hospital_staff DROP COLUMN IF EXISTS pincode;
  `);
}
