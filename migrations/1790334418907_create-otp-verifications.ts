 
import type {MigrationBuilder} from 'node-pg-migrate';

export const shorthands = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('otp_verifications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    mobile_number: { type: 'varchar(20)', notNull: true },
    otp_hash: { type: 'text', notNull: true },
    purpose: { type: 'varchar(50)', notNull: true, default: 'login' },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    attempt_count: { type: 'integer', notNull: true, default: 0 },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('otp_verifications', ['mobile_number', 'purpose']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('otp_verifications');
}
