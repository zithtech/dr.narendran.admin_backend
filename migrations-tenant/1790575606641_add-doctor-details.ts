/* eslint-disable */
// @ts-nocheck
import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('doctors', {
    qualification: { type: 'varchar(255)' },
    medical_registration_number: { type: 'varchar(255)' },
    clinic_address: { type: 'text' },
    is_active: { type: 'boolean', default: true },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('doctors', [
    'qualification',
    'medical_registration_number',
    'clinic_address',
    'is_active',
  ]);
}
