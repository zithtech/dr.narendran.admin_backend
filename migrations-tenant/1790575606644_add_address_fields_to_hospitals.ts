/* eslint-disable */
// @ts-nocheck
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('hospitals', {
    address_line_1: { type: 'varchar(255)' },
    address_line_2: { type: 'varchar(255)' },
    city: { type: 'varchar(100)' },
    state: { type: 'varchar(100)' },
    pincode: { type: 'varchar(20)' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('hospitals', [
    'address_line_1',
    'address_line_2',
    'city',
    'state',
    'pincode',
  ]);
}

