 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('prescription_medicines', {
    medicine_id: {
      type: 'uuid',
      notNull: false,
      references: '"medicines"',
      onDelete: 'SET NULL'
    }
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('prescription_medicines', 'medicine_id');
}
