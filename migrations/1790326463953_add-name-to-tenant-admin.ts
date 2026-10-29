/* eslint-disable */
// @ts-nocheck
import {MigrationBuilder, ColumnDefinitions} from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('tenant_admin_master_login', {
    name: {
      type: 'varchar(255)',
      notNull: true,
      default: 'Admin',
    },
  });
  
  // Remove the default if we don't want it for future inserts, 
  // but keeping it means existing records won't break if any.
  // We can leave the default as 'Admin'.
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('tenant_admin_master_login', 'name');
}
