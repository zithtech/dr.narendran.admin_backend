 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('medicines', {
    frequency: { type: 'varchar(100)', notNull: false },
    duration: { type: 'varchar(100)', notNull: false },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('medicines', ['frequency', 'duration']);
}
