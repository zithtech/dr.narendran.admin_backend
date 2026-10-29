import { type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('prescription_templates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'varchar(255)', notNull: true, default: 'Standard Prescription' },
    description: { type: 'text', default: 'A4 prescription layout used by doctors.' },
    html_content: { type: 'text', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'ACTIVE' },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('prescription_templates', 'status');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('prescription_templates');
}
 
