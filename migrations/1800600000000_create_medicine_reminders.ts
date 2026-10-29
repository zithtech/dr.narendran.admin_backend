import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('medicine_reminders', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    patient_id: {
      type: 'uuid',
      notNull: true,
    },
    prescription_id: {
      type: 'uuid',
      notNull: true,
      references: 'prescriptions',
      onDelete: 'CASCADE',
    },
    schedule_id: {
      type: 'uuid',
      notNull: false,
      references: 'medicine_schedules',
      onDelete: 'CASCADE',
    },
    reminder_type: {
      type: 'varchar(30)',
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

  pgm.createIndex('medicine_reminders', ['status', 'scheduled_for'], {
    name: 'idx_medicine_reminders_pending',
    where: "status = 'PENDING'",
  });

  pgm.createIndex('medicine_reminders', ['schedule_id', 'status'], {
    name: 'idx_medicine_reminders_schedule',
  });

  pgm.createIndex('medicine_reminders', ['prescription_id', 'status'], {
    name: 'idx_medicine_reminders_prescription',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('medicine_reminders', { ifExists: true, cascade: true });
}
