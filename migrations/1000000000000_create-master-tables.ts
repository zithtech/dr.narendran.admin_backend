/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // --- tenants ---
  pgm.createTable('tenants', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_code: {type: 'varchar(50)', notNull: true, unique: true},
    tenant_name: {type: 'varchar(255)', notNull: true},
    database_name: {type: 'varchar(255)', notNull: true, unique: true},
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
  }, { ifNotExists: true });

  // --- tenant_admin_master_login ---
  pgm.createTable('tenant_admin_master_login', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      references: '"tenants"',
      onDelete: 'CASCADE',
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
  }, { ifNotExists: true });

  // Basic updated_at trigger function
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {returns: 'trigger', language: 'plpgsql', replace: true},
    `
      BEGIN
          NEW.updated_at = current_timestamp;
          RETURN NEW;
      END;
    `,
  );

  pgm.createTrigger('tenants', 'set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  pgm.createTrigger('tenant_admin_master_login', 'set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('tenant_admin_master_login');
  pgm.dropTable('tenants');
  pgm.dropFunction('update_updated_at_column', []);
}
