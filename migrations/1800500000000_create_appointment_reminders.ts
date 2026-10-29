import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('appointment_reminders', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    appointment_id: {
      type: 'uuid',
      notNull: true,
      references: 'appointments',
      onDelete: 'CASCADE',
    },
    patient_id: {
      type: 'uuid',
      notNull: true,
    },
    reminder_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    scheduled_for: {
      type: 'timestamptz',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING',
    },
    idempotency_key: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    sent_at: {
      type: 'timestamptz',
      notNull: false,
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
  });

  pgm.createIndex('appointment_reminders', ['status', 'scheduled_for'], {
    name: 'idx_appointment_reminders_pending',
    where: "status = 'PENDING'",
  });

  pgm.createIndex('appointment_reminders', ['appointment_id', 'status'], {
    name: 'idx_appointment_reminders_appt_status',
  });

  // Backfill reminders for active upcoming appointments
  pgm.sql(`
    INSERT INTO appointment_reminders (appointment_id, patient_id, reminder_type, scheduled_for, idempotency_key)
    SELECT 
      a.id, 
      a.patient_id, 
      '1_DAY', 
      a.scheduled_start - INTERVAL '24 hours',
      'appt_rem:1_DAY:' || a.id || ':' || a.scheduled_start::text
    FROM appointments a
    WHERE a.status IN ('scheduled', 'confirmed', 'rescheduled')
      AND a.scheduled_start - INTERVAL '24 hours' > NOW()
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO appointment_reminders (appointment_id, patient_id, reminder_type, scheduled_for, idempotency_key)
    SELECT 
      a.id, 
      a.patient_id, 
      '30_MIN', 
      a.scheduled_start - INTERVAL '30 minutes',
      'appt_rem:30_MIN:' || a.id || ':' || a.scheduled_start::text
    FROM appointments a
    WHERE a.status IN ('scheduled', 'confirmed', 'rescheduled')
      AND a.scheduled_start - INTERVAL '30 minutes' > NOW()
    ON CONFLICT (idempotency_key) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('appointment_reminders', { ifExists: true, cascade: true });
}
