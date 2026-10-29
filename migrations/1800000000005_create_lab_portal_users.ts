import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create lab_portal_users table
  pgm.createTable('lab_portal_users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    lab_id: {
      type: 'uuid',
      notNull: true,
      references: '"labs"',
      onDelete: 'CASCADE',
      unique: true,
    },
    username: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'ACTIVE',
    },
    must_change_password: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    last_login_at: {
      type: 'timestamp',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // 2. Add contact_visibility column to labs if not present
  pgm.addColumns('labs', {
    contact_visibility: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
  });

  // 3. Add lab_id, description, price to lab_services
  pgm.addColumns('lab_services', {
    lab_id: {
      type: 'uuid',
      notNull: false,
      references: '"labs"',
      onDelete: 'CASCADE',
    },
    description: {
      type: 'text',
      notNull: false,
    },
    price: {
      type: 'numeric(10, 2)',
      notNull: false,
      default: 0,
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('lab_services', ['lab_id', 'description', 'price']);
  pgm.dropColumns('labs', ['contact_visibility']);
  pgm.dropTable('lab_portal_users');
}
