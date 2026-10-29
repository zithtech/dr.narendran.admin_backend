 
import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('btree_gist', { ifNotExists: true });

  pgm.createTable('doctor_custom_availability', {
    id: { type: 'uuid', default: pgm.func('gen_random_uuid()'), primaryKey: true },
    doctor_id: { type: 'uuid', notNull: true, references: '"doctors"', onDelete: 'CASCADE' },
    date: { type: 'date', notNull: true },
    location_id: { type: 'uuid', notNull: true, references: '"doctor_locations"', onDelete: 'CASCADE' },
    start_time: { type: 'time', notNull: true },
    end_time: { type: 'time', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'active' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });


}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('doctor_custom_availability');
}
