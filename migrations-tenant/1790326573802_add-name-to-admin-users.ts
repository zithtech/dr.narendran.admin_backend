/* eslint-disable */
// @ts-nocheck
import {MigrationBuilder, ColumnDefinitions} from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('admin_users', {
    name: {
      type: 'varchar(255)',
      notNull: true,
      default: 'Admin',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('admin_users', 'name');
}
