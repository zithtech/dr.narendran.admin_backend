import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE admin_users 
    ADD COLUMN IF NOT EXISTS portal_token VARCHAR(255) UNIQUE;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE admin_users 
    DROP COLUMN IF EXISTS portal_token;
  `);
}
