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
      joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      documents JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hospital_staff_hospital ON hospital_staff(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_branch ON hospital_staff(branch_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_role ON hospital_staff(role);
    CREATE INDEX IF NOT EXISTS idx_hospital_staff_status ON hospital_staff(status);

    -- Ensure RBAC module exists for STAFF
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rbac_modules') THEN
        INSERT INTO rbac_modules (slug, name, description)
        VALUES ('STAFF', 'Staff Management', 'Manage hospital staff details, roles, shifts, and documents')
        ON CONFLICT (slug) DO NOTHING;

        -- Grant System Administrator access
        INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
        VALUES ('System Administrator', 'STAFF', true, true, true)
        ON CONFLICT DO NOTHING;

        -- Grant Viewer read access
        INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
        VALUES ('Viewer', 'STAFF', true, false, false)
        ON CONFLICT DO NOTHING;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS hospital_staff CASCADE;
  `);
}

