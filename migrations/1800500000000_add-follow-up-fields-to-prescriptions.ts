import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS follow_up_days integer,
    ADD COLUMN IF NOT EXISTS follow_up_date date,
    ADD COLUMN IF NOT EXISTS follow_up_status varchar(20) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS follow_up_booked_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS follow_up_3day_reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS follow_up_sameday_reminder_sent_at timestamptz;

    CREATE INDEX IF NOT EXISTS idx_prescriptions_follow_up_date_status ON prescriptions(follow_up_date, follow_up_status);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('prescriptions', ['follow_up_date', 'follow_up_status'], {
    name: 'idx_prescriptions_follow_up_date_status',
  });
  pgm.dropColumn('prescriptions', [
    'follow_up_days',
    'follow_up_date',
    'follow_up_status',
    'follow_up_booked_appointment_id',
    'follow_up_reminder_sent_at',
    'follow_up_3day_reminder_sent_at',
    'follow_up_sameday_reminder_sent_at',
  ]);
}
