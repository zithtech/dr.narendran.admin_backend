/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('master_admin_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {type: 'varchar(255)', notNull: true},
    email: {type: 'varchar(255)', notNull: true, unique: true},
    password_hash: {type: 'text', notNull: true},
    role: {type: 'varchar(50)', notNull: true, default: "'Viewer'"},
    status: {type: 'varchar(50)', notNull: true, default: "'ACTIVE'"},
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createTrigger('master_admin_users', 'set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('master_admin_users');
}
