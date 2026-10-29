/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // --- admin_users ---
  pgm.createTable('admin_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
    },
    username: {type: 'varchar(255)', notNull: true, unique: true},
    password_hash: {type: 'text', notNull: true},
    phone: {type: 'varchar(50)'},
    role: {type: 'varchar(50)', notNull: true, default: 'SUPER_ADMIN'},
    status: {type: 'varchar(50)', notNull: true, default: 'ACTIVE'},
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

  pgm.createTrigger('admin_users', 'set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('admin_users');
}
