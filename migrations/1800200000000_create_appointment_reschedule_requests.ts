import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'appointment_reschedule_requests',
    {
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
      doctor_id: {
        type: 'uuid',
        notNull: true,
      },
      patient_id: {
        type: 'uuid',
        notNull: true,
      },
      proposed_slot_id: {
        type: 'uuid',
        notNull: true,
      },
      proposed_start: {
        type: 'timestamptz',
        notNull: true,
      },
      proposed_end: {
        type: 'timestamptz',
        notNull: true,
      },
      reason: {
        type: 'text',
        notNull: false,
      },
      status: {
        type: 'varchar(30)',
        notNull: true,
        default: 'pending',
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
      expires_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func("now() + interval '48 hours'"),
      },
    },
    {
      ifNotExists: true,
      constraints: {
        check: [
          "status IN ('pending', 'confirmed', 'declined', 'cancelled', 'expired')",
          'proposed_end > proposed_start',
        ],
      },
    },
  );

  pgm.createIndex('appointment_reschedule_requests', ['appointment_id', 'status'], {
    ifNotExists: true,
  });
  pgm.createIndex('appointment_reschedule_requests', ['doctor_id', 'proposed_start'], {
    ifNotExists: true,
    where: "status = 'pending'",
  });
  pgm.createIndex('appointment_reschedule_requests', ['patient_id', 'status'], {
    ifNotExists: true,
  });
  pgm.createIndex('appointment_reschedule_requests', ['expires_at'], {
    ifNotExists: true,
    where: "status = 'pending'",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('appointment_reschedule_requests', { ifExists: true, cascade: true });
}
