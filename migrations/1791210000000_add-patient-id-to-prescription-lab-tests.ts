/* eslint-disable @typescript-eslint/require-await */
import { type MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

/**
 * Add patient_id to prescription_lab_tests so each lab test record can be
 * directly linked to the patient (without having to join through prescriptions).
 *
 * Also backfills existing rows from the parent prescriptions table.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add the column (nullable initially so existing rows don't break)
  pgm.addColumn('prescription_lab_tests', {
    patient_id: {
      type: 'uuid',
      notNull: false,
      references: '"patients"',
      onDelete: 'SET NULL',
    },
  }, { ifNotExists: true });

  // 2. Backfill existing rows from the parent prescription
  pgm.sql(`
    UPDATE prescription_lab_tests plt
    SET patient_id = p.patient_id
    FROM prescriptions p
    WHERE plt.prescription_id = p.id
      AND p.patient_id IS NOT NULL
  `);

  // 3. Add an index for fast lookups by patient
  pgm.createIndex('prescription_lab_tests', 'patient_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('prescription_lab_tests', 'patient_id');
  pgm.dropColumn('prescription_lab_tests', 'patient_id');
}
