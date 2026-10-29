 
import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'medicine_schedules',
    {
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
        references: 'prescriptions(id)',
        onDelete: 'CASCADE',
      },
      prescription_medicine_id: {
        type: 'uuid',
        notNull: false,
        references: 'prescription_medicines(id)',
        onDelete: 'SET NULL',
      },
      medicine_id: {
        type: 'uuid',
        notNull: false,
        references: 'medicines(id)',
        onDelete: 'SET NULL',
      },
      medicine_name: {
        type: 'varchar(255)',
        notNull: true,
      },
      dosage: {
        type: 'varchar(100)',
      },
      dose_quantity: {
        type: 'varchar(50)',
      },
      frequency: {
        type: 'varchar(100)',
      },
      duration: {
        type: 'varchar(100)',
      },
      food_instruction: {
        type: 'varchar(100)',
      },
      instructions: {
        type: 'text',
      },
      scheduled_date: {
        type: 'date',
        notNull: true,
      },
      scheduled_time: {
        type: 'varchar(20)',
        notNull: true,
      },
      status: {
        type: 'varchar(20)',
        notNull: true,
        default: 'PENDING',
      },
      taken_at: {
        type: 'timestamptz',
      },
      missed_at: {
        type: 'timestamptz',
      },
      skipped_at: {
        type: 'timestamptz',
      },
      skip_reason: {
        type: 'text',
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

  pgm.createIndex('medicine_schedules', ['patient_id', 'scheduled_date'], {
    name: 'idx_med_sched_patient_date',
    ifNotExists: true,
  });

  pgm.createIndex('medicine_schedules', ['prescription_id'], {
    name: 'idx_med_sched_prescription',
    ifNotExists: true,
  });

  pgm.createIndex('medicine_schedules', ['status'], {
    name: 'idx_med_sched_status',
    ifNotExists: true,
  });

  pgm.addConstraint(
    'medicine_schedules',
    'uq_med_sched_dose',
    {
      unique: ['patient_id', 'prescription_id', 'medicine_name', 'scheduled_date', 'scheduled_time'],
    }
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('medicine_schedules', { ifExists: true });
}
