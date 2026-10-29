 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('prescription_lab_tests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    prescription_id: {
      type: 'uuid',
      notNull: true,
      references: '"prescriptions"',
      onDelete: 'CASCADE',
    },
    lab_test_id: {
      type: 'uuid',
      notNull: false,
      references: '"lab_tests"',
      onDelete: 'SET NULL',
    },
    test_name: { type: 'varchar(255)', notNull: true },
    instructions: { type: 'text' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('prescription_lab_tests', 'prescription_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('prescription_lab_tests');
}
