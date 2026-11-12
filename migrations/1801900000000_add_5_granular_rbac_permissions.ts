import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE rbac_role_permissions
      ADD COLUMN IF NOT EXISTS can_create boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_update boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_manage boolean DEFAULT false;

    UPDATE rbac_role_permissions
    SET
      can_create = COALESCE(can_write, false),
      can_update = COALESCE(can_write, false),
      can_manage = (
        COALESCE(can_read, false)
        AND COALESCE(can_write, false)
        AND COALESCE(can_delete, false)
      )
    WHERE can_create IS NULL
       OR can_update IS NULL
       OR can_manage IS NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE rbac_role_permissions
      DROP COLUMN IF EXISTS can_manage,
      DROP COLUMN IF EXISTS can_update,
      DROP COLUMN IF EXISTS can_create;
  `);
}

