 
import { type ColumnDefinitions, type MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medicines' AND column_name='name') THEN
        ALTER TABLE medicines RENAME COLUMN name TO medicine_name;
      END IF;
    END $$;

    ALTER TABLE medicines 
      ADD COLUMN IF NOT EXISTS generic_name varchar(255) DEFAULT '',
      ADD COLUMN IF NOT EXISTS strength_unit varchar(50) DEFAULT '',
      ADD COLUMN IF NOT EXISTS dosage_form varchar(100) DEFAULT '',
      ADD COLUMN IF NOT EXISTS therapeutic_category varchar(255) DEFAULT '',
      ADD COLUMN IF NOT EXISTS sub_category varchar(255),
      ADD COLUMN IF NOT EXISTS manufacturer varchar(255) DEFAULT '',
      ADD COLUMN IF NOT EXISTS prescription_required boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS status varchar(50) DEFAULT 'Active',
      ADD COLUMN IF NOT EXISTS medicine_code varchar(100),
      ADD COLUMN IF NOT EXISTS barcode varchar(100),
      ADD COLUMN IF NOT EXISTS mrp numeric(10,2),
      ADD COLUMN IF NOT EXISTS discount_type varchar(50),
      ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
      ADD COLUMN IF NOT EXISTS final_price numeric(10,2),
      ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT current_timestamp;

    ALTER TABLE medicines ALTER COLUMN generic_name DROP DEFAULT;
    ALTER TABLE medicines ALTER COLUMN strength_unit DROP DEFAULT;
    ALTER TABLE medicines ALTER COLUMN dosage_form DROP DEFAULT;
    ALTER TABLE medicines ALTER COLUMN therapeutic_category DROP DEFAULT;
    ALTER TABLE medicines ALTER COLUMN manufacturer DROP DEFAULT;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE medicines 
      DROP COLUMN IF EXISTS generic_name,
      DROP COLUMN IF EXISTS strength_unit,
      DROP COLUMN IF EXISTS dosage_form,
      DROP COLUMN IF EXISTS therapeutic_category,
      DROP COLUMN IF EXISTS sub_category,
      DROP COLUMN IF EXISTS manufacturer,
      DROP COLUMN IF EXISTS prescription_required,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS medicine_code,
      DROP COLUMN IF EXISTS barcode,
      DROP COLUMN IF EXISTS mrp,
      DROP COLUMN IF EXISTS discount_type,
      DROP COLUMN IF EXISTS discount_value,
      DROP COLUMN IF EXISTS final_price,
      DROP COLUMN IF EXISTS updated_at;
      
    DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medicines' AND column_name='medicine_name') THEN
        ALTER TABLE medicines RENAME COLUMN medicine_name TO name;
      END IF;
    END $$;
  `);
}
