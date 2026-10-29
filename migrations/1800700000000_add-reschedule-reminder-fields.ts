import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE appointment_reschedule_requests
    ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_reschedule_requests_status ON appointment_reschedule_requests(status);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('appointment_reschedule_requests', [
    'last_reminder_sent_at',
    'reminder_count',
  ]);
}
