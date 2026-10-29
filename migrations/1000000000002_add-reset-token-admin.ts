/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('master_admin_users', {
    reset_token: {type: 'varchar(255)'},
    reset_token_expires_at: {type: 'timestamp with time zone'},
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('master_admin_users', [
    'reset_token',
    'reset_token_expires_at',
  ]);
}
