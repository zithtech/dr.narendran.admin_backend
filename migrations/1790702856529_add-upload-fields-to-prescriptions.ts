 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('prescriptions', {
    prescription_type: {
      type: 'varchar(50)',
      default: 'system',
      notNull: true,
    },
    image_url: {
      type: 'text',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('prescriptions', 'prescription_type');
  pgm.dropColumn('prescriptions', 'image_url');
}
