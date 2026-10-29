import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Drop the foreign key on performed_by since it can reference user_accounts, admin_users, or users
  pgm.dropConstraint(
    'medicine_stock_history',
    'medicine_stock_history_performed_by_fkey',
    { ifExists: true },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addConstraint(
    'medicine_stock_history',
    'medicine_stock_history_performed_by_fkey',
    {
      foreignKeys: {
        columns: 'performed_by',
        references: 'users(id)',
        onDelete: 'SET NULL',
      },
    },
  );
}
