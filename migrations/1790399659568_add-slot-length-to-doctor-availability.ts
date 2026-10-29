 
import type {MigrationBuilder} from 'node-pg-migrate';

export const shorthands = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('doctor_availability', {
    slot_length: {
      type: 'smallint',
      notNull: true,
      default: 30
    }
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn('doctor_availability', 'slot_length');
}
