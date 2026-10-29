 
import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.renameColumn('otp_verifications', 'mobile_number', 'phone');
}

export function down(pgm: MigrationBuilder): void {
  pgm.renameColumn('otp_verifications', 'phone', 'mobile_number');
}
