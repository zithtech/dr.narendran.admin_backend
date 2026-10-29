import type { ColumnDefinitions } from 'node-pg-migrate';
import { MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create medicine_packages table
  pgm.createTable('medicine_packages', {
    id: {
      type: 'uuid',
      default: pgm.func('uuid_generate_v4()'),
      primaryKey: true,
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: '"doctors"',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Index on doctor_id
  pgm.createIndex('medicine_packages', 'doctor_id');

  // Create medicine_package_items table
  pgm.createTable('medicine_package_items', {
    id: {
      type: 'uuid',
      default: pgm.func('uuid_generate_v4()'),
      primaryKey: true,
    },
    package_id: {
      type: 'uuid',
      notNull: true,
      references: '"medicine_packages"',
      onDelete: 'CASCADE',
    },
    medicine_id: {
      type: 'uuid',
      notNull: true,
      references: '"medicines"',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Indexes on package items
  pgm.createIndex('medicine_package_items', 'package_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('medicine_package_items');
  pgm.dropTable('medicine_packages');
}
