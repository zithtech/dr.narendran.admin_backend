 
import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Application settings/legal documents
  pgm.createTable('legal_documents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    type: { type: 'varchar(50)', notNull: true, unique: true }, // 'TERMS', 'PRIVACY'
    content: { type: 'text', notNull: true },
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

  // Insert initial empty rows
  pgm.sql(`
    INSERT INTO legal_documents (type, content) VALUES
    ('TERMS', '# Terms & Conditions\\n\\nPlease review our terms and conditions.'),
    ('PRIVACY', '# Privacy Policy\\n\\nPlease review our privacy policy.')
  `);

  // Support Tickets
  pgm.createTable('support_tickets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true },
    user_type: { type: 'varchar(50)', notNull: true }, // 'DOCTOR', 'PATIENT', etc.
    subject: { type: 'varchar(255)', notNull: true },
    message: { type: 'text', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'OPEN' }, // 'OPEN', 'RESOLVED', 'CLOSED'
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
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('support_tickets');
  pgm.dropTable('legal_documents');
}
