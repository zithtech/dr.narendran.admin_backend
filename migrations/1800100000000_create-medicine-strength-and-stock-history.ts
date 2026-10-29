import { type ColumnDefinitions, type MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Drop obsolete multi-pharmacy tables in strict dependency order
  pgm.sql(`
    DROP TABLE IF EXISTS pharmacy_stock_transfer_items CASCADE;
    DROP TABLE IF EXISTS pharmacy_stock_transfers CASCADE;
    DROP TABLE IF EXISTS pharmacy_medicine_stock_history CASCADE;
    DROP TABLE IF EXISTS pharmacy_medicine_stock_batches CASCADE;
    DROP TABLE IF EXISTS pharmacy_medicine_stock CASCADE;
    DROP TABLE IF EXISTS medicine_strength CASCADE;
    DROP TABLE IF EXISTS pharmacies CASCADE;
  `);

  // 2. Create single-pharmacy medicine_strength table
  pgm.createTable(
    'medicine_strength',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      medicine_id: {
        type: 'uuid',
        notNull: true,
        references: 'medicines(id)',
        onDelete: 'RESTRICT',
      },
      strength: {
        type: 'varchar(100)',
        notNull: true,
      },
      strength_unit: {
        type: 'varchar(50)',
        notNull: true,
      },
      dosage_form: {
        type: 'varchar(100)',
        notNull: true,
      },
      strip_count: {
        type: 'integer',
        notNull: true,
        default: 0,
      },
      tablets_per_strip: {
        type: 'integer',
        notNull: false,
      },
      total_tablets: {
        type: 'integer',
        notNull: true,
        default: 0,
      },
      available_quantity: {
        type: 'integer',
        notNull: true,
        default: 0,
      },
      mrp: {
        type: 'numeric(10,2)',
        notNull: false,
      },
      discount_type: {
        type: 'varchar(50)',
        notNull: false,
      },
      discount_value: {
        type: 'numeric(10,2)',
        notNull: false,
      },
      final_price: {
        type: 'numeric(10,2)',
        notNull: false,
      },
      purchase_price: {
        type: 'numeric(10,2)',
        notNull: false,
      },
      reorder_level: {
        type: 'integer',
        notNull: true,
        default: 10,
      },
      variant_code: {
        type: 'varchar(100)',
        notNull: false,
      },
      barcode: {
        type: 'varchar(100)',
        notNull: false,
      },
      status: {
        type: 'varchar(50)',
        notNull: true,
        default: 'ACTIVE',
      },
      notes: {
        type: 'text',
        notNull: false,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    {
      ifNotExists: true,
      constraints: {
        check: [
          'available_quantity >= 0',
          'strip_count >= 0',
          'total_tablets >= 0',
          'reorder_level >= 0',
          "status IN ('ACTIVE', 'INACTIVE')",
        ],
      },
    }
  );

  pgm.createIndex('medicine_strength', 'medicine_id', { ifNotExists: true });
  pgm.createIndex('medicine_strength', 'status', { ifNotExists: true });
  pgm.createIndex('medicine_strength', ['available_quantity', 'reorder_level'], { ifNotExists: true });

  // Unique index per formulation variant to prevent duplicates
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_medicine_strength_variant
    ON medicine_strength (
      medicine_id,
      lower(trim(strength)),
      lower(trim(strength_unit)),
      lower(trim(dosage_form)),
      COALESCE(tablets_per_strip, 1)
    );
  `);

  // 3. Create append-only medicine_stock_history table
  pgm.createTable(
    'medicine_stock_history',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      medicine_strength_id: {
        type: 'uuid',
        notNull: true,
        references: 'medicine_strength(id)',
        onDelete: 'RESTRICT',
      },
      transaction_type: {
        type: 'varchar(50)',
        notNull: true,
      },
      quantity_change: {
        type: 'integer',
        notNull: true,
      },
      quantity_before: {
        type: 'integer',
        notNull: true,
      },
      quantity_after: {
        type: 'integer',
        notNull: true,
      },
      unit_cost: {
        type: 'numeric(10,2)',
        notNull: false,
      },
      reference_number: {
        type: 'varchar(100)',
        notNull: false,
      },
      reason: {
        type: 'text',
        notNull: false,
      },
      notes: {
        type: 'text',
        notNull: false,
      },
      performed_by: {
        type: 'uuid',
        notNull: false,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    {
      ifNotExists: true,
      constraints: {
        check: [
          'quantity_after = quantity_before + quantity_change',
          'quantity_before >= 0',
          'quantity_after >= 0',
          "transaction_type IN ('OPENING_STOCK', 'STOCK_IN', 'STOCK_OUT', 'DISPENSE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED', 'REVERSAL')",
        ],
      },
    }
  );

  pgm.createIndex('medicine_stock_history', ['medicine_strength_id', { name: 'created_at', sort: 'DESC' }], { ifNotExists: true });
  pgm.createIndex('medicine_stock_history', 'transaction_type', { ifNotExists: true });
  pgm.createIndex('medicine_stock_history', 'performed_by', { ifNotExists: true });

  // 4. Seed baseline variants from existing medicines (additive, 0 initial stock)
  pgm.sql(`
    INSERT INTO medicine_strength (
      medicine_id, strength, strength_unit, dosage_form, strip_count, tablets_per_strip, total_tablets,
      available_quantity, mrp, discount_type, discount_value, final_price, purchase_price,
      reorder_level, variant_code, barcode, status, notes
    )
    SELECT 
      m.id,
      COALESCE(NULLIF(TRIM(m.strength), ''), 'Standard'),
      COALESCE(NULLIF(TRIM(m.strength_unit), ''), 'Unit'),
      COALESCE(NULLIF(TRIM(m.dosage_form), ''), 'Tablet'),
      0,
      10,
      0,
      0,
      m.mrp,
      m.discount_type,
      m.discount_value,
      COALESCE(m.final_price, m.mrp),
      NULL,
      10,
      m.medicine_code,
      m.barcode,
      CASE WHEN m.status = 'Active' THEN 'ACTIVE' ELSE 'INACTIVE' END,
      'Initial baseline variant migrated from master catalog'
    FROM medicines m
    ON CONFLICT DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('medicine_stock_history', { ifExists: true });
  pgm.dropTable('medicine_strength', { ifExists: true });
}
