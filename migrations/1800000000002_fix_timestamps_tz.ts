import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Alter lab_services
  pgm.alterColumn('lab_services', 'created_at', { type: 'timestamptz', using: 'created_at AT TIME ZONE \'UTC\'' });
  pgm.alterColumn('lab_services', 'updated_at', { type: 'timestamptz', using: 'updated_at AT TIME ZONE \'UTC\'' });
  
  // Alter labs
  pgm.alterColumn('labs', 'created_at', { type: 'timestamptz', using: 'created_at AT TIME ZONE \'UTC\'' });
  pgm.alterColumn('labs', 'updated_at', { type: 'timestamptz', using: 'updated_at AT TIME ZONE \'UTC\'' });
  
  // Alter rbac
  pgm.alterColumn('rbac_roles', 'created_at', { type: 'timestamptz', using: 'created_at AT TIME ZONE \'UTC\'' });
  pgm.alterColumn('rbac_modules', 'created_at', { type: 'timestamptz', using: 'created_at AT TIME ZONE \'UTC\'' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert lab_services
  pgm.alterColumn('lab_services', 'created_at', { type: 'timestamp' });
  pgm.alterColumn('lab_services', 'updated_at', { type: 'timestamp' });
  
  // Revert labs
  pgm.alterColumn('labs', 'created_at', { type: 'timestamp' });
  pgm.alterColumn('labs', 'updated_at', { type: 'timestamp' });
  
  // Revert rbac
  pgm.alterColumn('rbac_roles', 'created_at', { type: 'timestamp' });
  pgm.alterColumn('rbac_modules', 'created_at', { type: 'timestamp' });
}
