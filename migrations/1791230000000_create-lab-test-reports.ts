 
import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    'lab_test_reports',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      prescription_lab_test_id: {
        type: 'uuid',
        notNull: false,
        references: 'prescription_lab_tests(id)',
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: 'uuid',
        notNull: true,
      },
      file_name: {
        type: 'varchar(255)',
        notNull: true,
      },
      file_type: {
        type: 'varchar(100)',
        notNull: true,
      },
      file_size: {
        type: 'bigint',
        notNull: false,
      },
      report_date: {
        type: 'date',
        notNull: true,
      },
      document_url: {
        type: 'text',
        notNull: true,
      },
      storage_key: {
        type: 'text',
        notNull: false,
      },
      notes: {
        type: 'text',
        notNull: false,
      },
      uploaded_by: {
        type: 'uuid',
        notNull: true,
      },
      is_external: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      test_name: {
        type: 'varchar(255)',
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
    },
    { ifNotExists: true },
  );

  pgm.createIndex('lab_test_reports', ['prescription_lab_test_id'], {
    name: 'idx_lab_reports_prescription_test',
    ifNotExists: true,
  });

  pgm.createIndex('lab_test_reports', ['patient_id'], {
    name: 'idx_lab_reports_patient',
    ifNotExists: true,
  });

  pgm.createIndex('lab_test_reports', ['report_date'], {
    name: 'idx_lab_reports_date',
    ifNotExists: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('lab_test_reports', { ifExists: true });
}
