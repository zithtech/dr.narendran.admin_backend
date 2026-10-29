 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Drop the foreign key on doctor_id since it might reference user_accounts OR users,
  // making a strict single-table FK impossible without architectural changes.
  pgm.dropConstraint('doctor_locations', 'doctor_locations_doctor_id_fkey', { ifExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Can't reliably re-add the constraint if there is mixed data, but for completeness:
  pgm.addConstraint('doctor_locations', 'doctor_locations_doctor_id_fkey', {
    foreignKeys: {
      columns: 'doctor_id',
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
  });
}
