import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('labs', {
    start_time: { type: 'varchar(10)' },
    end_time: { type: 'varchar(10)' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('labs', ['start_time', 'end_time']);
}
