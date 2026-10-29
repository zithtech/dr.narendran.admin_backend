import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. User app preferences table (stores doctor & patient app settings)
  pgm.createTable('user_preferences', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, unique: true },
    preferences: { type: 'jsonb', notNull: true, default: '{}' },
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

  pgm.createIndex('user_preferences', 'user_id');

  // 2. Privacy concerns, data export requests, and data erasure requests
  pgm.createTable('privacy_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    request_id: { type: 'varchar(50)', notNull: true, unique: true },
    user_id: { type: 'uuid', notNull: true },
    user_type: { type: 'varchar(50)', notNull: true }, // 'DOCTOR', 'PATIENT', 'ADMIN'
    request_type: { type: 'varchar(50)', notNull: true }, // 'PRIVACY_CONCERN', 'DATA_EXPORT', 'DATA_ERASURE'
    category: { type: 'varchar(100)' },
    subject: { type: 'varchar(255)' },
    details: { type: 'text' },
    format: { type: 'varchar(50)' }, // 'PDF', 'JSON_FHIR', 'CSV'
    status: { type: 'varchar(50)', notNull: true, default: 'PENDING' }, // 'PENDING', 'IN_REVIEW', 'PROCESSING', 'COMPLETED', 'REJECTED'
    resolution_notes: { type: 'text' },
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

  pgm.createIndex('privacy_requests', ['user_id', 'request_type']);
  pgm.createIndex('privacy_requests', 'status');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('privacy_requests');
  pgm.dropTable('user_preferences');
}
