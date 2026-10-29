 
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();
  // 1. Doctor weekly availability rules
  // Supports two time windows per day (e.g. 09:30–12:30 · 16:00–18:00)
  pgm.createTable('doctor_availability', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    day_of_week: { type: 'smallint', notNull: true }, // 0=Sun … 6=Sat
    start_time_1: { type: 'time', notNull: true },
    end_time_1: { type: 'time', notNull: true },
    start_time_2: { type: 'time' }, // optional afternoon session
    end_time_2: { type: 'time' },
    slot_duration_minutes: { type: 'smallint', notNull: true, default: 30 },
    is_active: { type: 'boolean', notNull: true, default: true },
  });

  pgm.addConstraint(
    'doctor_availability',
    'chk_day_of_week',
    'CHECK (day_of_week BETWEEN 0 AND 6)',
  );
  pgm.addConstraint(
    'doctor_availability',
    'chk_times_1',
    'CHECK (end_time_1 > start_time_1)',
  );
  pgm.addConstraint(
    'doctor_availability',
    'uq_doctor_day',
    'UNIQUE (doctor_id, day_of_week)',
  );

  // 2. Blocked date ranges (e.g. "24–28 Sep — Conference")
  pgm.createTable('doctor_blocked_dates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    start_date: { type: 'date', notNull: true },
    end_date: { type: 'date', notNull: true },
    reason: { type: 'text' },
  });

  pgm.addConstraint(
    'doctor_blocked_dates',
    'chk_date_range',
    'CHECK (end_date >= start_date)',
  );

  // 3. Individual bookable slots (generated from availability rules)
  pgm.createTable('appointment_slots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    slot_date: { type: 'date', notNull: true },
    start_time: { type: 'time', notNull: true },
    end_time: { type: 'time', notNull: true },
    is_booked: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.addConstraint(
    'appointment_slots',
    'uq_slot',
    'UNIQUE (doctor_id, slot_date, start_time)',
  );

  // 4. Appointments
  // Phase 1: doctor-app only — patient stored as plain text (no patients table yet)
  pgm.createTable('appointments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    slot_id: { type: 'uuid', references: 'appointment_slots(id)' },
    patient_name: { type: 'text', notNull: true },
    patient_phone: { type: 'text' },
    scheduled_start: { type: 'timestamptz', notNull: true },
    scheduled_end: { type: 'timestamptz', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'scheduled',
    },
    visit_reason: { type: 'text' },
    reschedule_reason: { type: 'text' },
    cancellation_reason: { type: 'text' },
    cancelled_by: { type: 'uuid', references: 'users(id)' },
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

  pgm.addConstraint(
    'appointments',
    'chk_appt_status',
    `CHECK (status IN ('scheduled','rescheduled','cancelled','completed','no_show'))`,
  );
  pgm.addConstraint(
    'appointments',
    'chk_appt_times',
    'CHECK (scheduled_end > scheduled_start)',
  );

  pgm.createIndex('appointments', ['doctor_id', 'scheduled_start'], {
    name: 'idx_appt_doctor',
  });

  // 5. Appointment status change audit trail
  pgm.createTable('appointment_status_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    appointment_id: {
      type: 'uuid',
      notNull: true,
      references: 'appointments(id)',
      onDelete: 'CASCADE',
    },
    status: { type: 'text', notNull: true },
    changed_by: { type: 'uuid', references: 'users(id)' },
    changed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    notes: { type: 'text' },
  });

  // 6. Consultation notes (autosaved during consultation)
  pgm.createTable('consultation_notes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    appointment_id: {
      type: 'uuid',
      notNull: true,
      references: 'appointments(id)',
      onDelete: 'CASCADE',
    },
    doctor_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    notes_text: { type: 'text' },
    diagnosis: { type: 'text' },
    vitals: { type: 'jsonb' }, // { bp, weight, temperature, etc. }
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

  pgm.addConstraint(
    'consultation_notes',
    'uq_note_per_appt',
    'UNIQUE (appointment_id)',
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  await Promise.resolve();
  pgm.dropTable('consultation_notes');
  pgm.dropTable('appointment_status_history');
  pgm.dropTable('appointments');
  pgm.dropTable('appointment_slots');
  pgm.dropTable('doctor_blocked_dates');
  pgm.dropTable('doctor_availability');
}
