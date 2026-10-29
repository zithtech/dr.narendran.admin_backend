import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Device tokens table
  pgm.createTable(
    'notification_device_tokens',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
      },
      token: {
        type: 'text',
        notNull: true,
      },
      platform: {
        type: 'varchar(20)',
        notNull: true,
        default: 'ANDROID',
      },
      device_id: {
        type: 'varchar(255)',
        notNull: false,
      },
      app_type: {
        type: 'varchar(20)',
        notNull: true,
        default: 'PATIENT',
      },
      is_active: {
        type: 'boolean',
        notNull: true,
        default: true,
      },
      last_seen_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    { ifNotExists: true },
  );

  pgm.createIndex('notification_device_tokens', ['user_id', 'token'], {
    name: 'idx_device_tokens_user_token',
    unique: true,
    ifNotExists: true,
  });

  pgm.createIndex('notification_device_tokens', ['user_id', 'is_active'], {
    name: 'idx_device_tokens_user_active',
    ifNotExists: true,
  });

  pgm.createIndex('notification_device_tokens', ['token'], {
    name: 'idx_device_tokens_token',
    ifNotExists: true,
  });

  // 2. In-app notification history table
  pgm.createTable(
    'notifications',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
      },
      type: {
        type: 'varchar(100)',
        notNull: true,
      },
      title: {
        type: 'varchar(255)',
        notNull: true,
      },
      body: {
        type: 'text',
        notNull: true,
      },
      entity_type: {
        type: 'varchar(50)',
        notNull: false,
      },
      entity_id: {
        type: 'varchar(255)',
        notNull: false,
      },
      route: {
        type: 'varchar(100)',
        notNull: false,
      },
      data: {
        type: 'jsonb',
        notNull: false,
      },
      is_read: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      read_at: {
        type: 'timestamptz',
        notNull: false,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    { ifNotExists: true },
  );

  pgm.createIndex('notifications', ['user_id', 'is_read', 'created_at'], {
    name: 'idx_notifications_user_read_created',
    ifNotExists: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('notifications', { ifExists: true });
  pgm.dropTable('notification_device_tokens', { ifExists: true });
}
