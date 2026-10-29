 
import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  pgm.createTable('lab_tests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()')
    },
    name: {
      type: 'varchar(255)',
      notNull: true
    },
    test_type: {
      type: 'varchar(100)',
      notNull: true
    },
    description: {
      type: 'text',
      notNull: false
    },
    price: {
      type: 'numeric(10,2)',
      notNull: false
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'Active'
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  // Create an index for faster searching
  pgm.createIndex('lab_tests', ['name', 'test_type']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('lab_tests');
}
