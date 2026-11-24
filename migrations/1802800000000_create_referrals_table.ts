import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS referrals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(255),
      gender VARCHAR(50),
      occupation VARCHAR(150),
      profile_image_url TEXT,
      address_line_1 VARCHAR(255),
      address_line_2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
    CREATE INDEX IF NOT EXISTS idx_referrals_phone ON referrals(phone);
    CREATE INDEX IF NOT EXISTS idx_referrals_name ON referrals(name);

    -- Ensure RBAC module exists for REFERRALS
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rbac_modules') THEN
        INSERT INTO rbac_modules (slug, name, description)
        VALUES ('REFERRALS', 'Referrals', 'Manage patient referrals, specialists, and partner network')
        ON CONFLICT (slug) DO NOTHING;

        -- Grant System Administrator access if role exists
        IF EXISTS (SELECT 1 FROM rbac_roles WHERE name = 'System Administrator') THEN
          INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
          VALUES ('System Administrator', 'REFERRALS', true, true, true)
          ON CONFLICT DO NOTHING;
        END IF;

        -- Grant Viewer read access if role exists
        IF EXISTS (SELECT 1 FROM rbac_roles WHERE name = 'Viewer') THEN
          INSERT INTO rbac_role_permissions (role_name, module_slug, can_read, can_write, can_delete)
          VALUES ('Viewer', 'REFERRALS', true, false, false)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS referrals;
    DELETE FROM rbac_role_permissions WHERE module_slug = 'REFERRALS';
    DELETE FROM rbac_modules WHERE slug = 'REFERRALS';
  `);
}
