/* eslint-disable @typescript-eslint/require-await */
import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

/**
 * Add lab_id to prescription_lab_tests so each prescribed test can be assigned
 * to a specific diagnostic center / lab from the labs table.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add nullable lab_id referencing labs(id)
  pgm.addColumn('prescription_lab_tests', {
    lab_id: {
      type: 'uuid',
      notNull: false,
      references: '"labs"',
      onDelete: 'SET NULL',
    },
  }, { ifNotExists: true });

  // 2. Add an index for fast lookups by lab_id
  pgm.createIndex('prescription_lab_tests', 'lab_id', { ifNotExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('prescription_lab_tests', 'lab_id', { ifExists: true });
  pgm.dropColumn('prescription_lab_tests', 'lab_id', { ifExists: true });
}
