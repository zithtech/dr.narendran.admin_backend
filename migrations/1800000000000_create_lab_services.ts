import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('lab_services', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(255)', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'ACTIVE' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createTable('lab_service_mappings', {
    lab_id: {
      type: 'uuid',
      notNull: true,
      references: '"labs"',
      onDelete: 'CASCADE',
    },
    service_id: {
      type: 'uuid',
      notNull: true,
      references: '"lab_services"',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('lab_service_mappings', 'pk_lab_service_mappings', {
    primaryKey: ['lab_id', 'service_id'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('lab_service_mappings');
  pgm.dropTable('lab_services');
}
