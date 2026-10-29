import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('linked_medicals', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    address_line_1: {
      type: 'varchar(255)',
    },
    address_line_2: {
      type: 'varchar(255)',
    },
    city: {
      type: 'varchar(100)',
    },
    state: {
      type: 'varchar(100)',
    },
    pincode: {
      type: 'varchar(20)',
    },
    phone: {
      type: 'varchar(20)',
    },
    email: {
      type: 'varchar(255)',
    },
    map_link: {
      type: 'varchar(500)',
    },
    start_time: {
      type: 'varchar(10)',
    },
    end_time: {
      type: 'varchar(10)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'ACTIVE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('linked_medicals');
}
