import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add delivery metadata and idempotency columns to notifications table
  pgm.addColumns('notifications', {
    idempotency_key: {
      type: 'varchar(255)',
      notNull: false,
    },
    delivery_status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'PENDING',
    },
    delivered_at: {
      type: 'timestamptz',
      notNull: false,
    },
    delivery_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    failure_reason: {
      type: 'text',
      notNull: false,
    },
  });

  // Unique index on (user_id, idempotency_key) where idempotency_key is not null
  pgm.createIndex('notifications', ['user_id', 'idempotency_key'], {
    name: 'idx_notifications_user_idempotency',
    unique: true,
    where: 'idempotency_key IS NOT NULL',
    ifNotExists: true,
  });

  // Secondary query index for fast retrieval of notifications
  pgm.createIndex('notifications', ['user_id', 'created_at'], {
    name: 'idx_notifications_user_created_at',
    ifNotExists: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('notifications', ['user_id', 'created_at'], {
    name: 'idx_notifications_user_created_at',
    ifExists: true,
  });

  pgm.dropIndex('notifications', ['user_id', 'idempotency_key'], {
    name: 'idx_notifications_user_idempotency',
    ifExists: true,
  });

  pgm.dropColumns('notifications', [
    'idempotency_key',
    'delivery_status',
    'delivered_at',
    'delivery_attempts',
    'failure_reason',
  ]);
}
