import { describe, expect, it } from 'vitest';
import {
  adjustStockSchema,
  batchDispenseSchema,
  damagedStockSchema,
  dispenseStockSchema,
  queryAllHistorySchema,
  returnStockSchema,
  stockInSchema,
  stockOutSchema,
} from '../../src/modules/inventory/inventory.schema.js';
import {
  createMedicineStrengthSchema,
  updateMedicineStrengthSchema,
} from '../../src/modules/medicine_strengths/medicine_strengths.schema.js';

describe('Inventory & Stock Validation Schema (Medicine Inventory)', () => {
  describe('dispenseStockSchema (Reduce Medicine)', () => {
    it('accepts valid single tablet dispense data', () => {
      const valid = {
        medicine_strength_id: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 10,
        patient_name: 'Ramesh Kumar',
        reference_number: 'DISP-2026-001',
        reason: 'Given to Patient',
        notes: '1 tablet twice daily after meals',
      };
      const result = dispenseStockSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative quantity in dispense', () => {
      expect(dispenseStockSchema.safeParse({ quantity: 0 }).success).toBe(false);
      expect(dispenseStockSchema.safeParse({ quantity: -5 }).success).toBe(false);
    });
  });

  describe('batchDispenseSchema (Reduce Medicine Batch)', () => {
    it('accepts valid batch dispense with multiple medicines', () => {
      const valid = {
        items: [
          {
            medicine_strength_id: '123e4567-e89b-12d3-a456-426614174000',
            quantity: 10,
            notes: 'Paracetamol 500mg',
          },
          {
            medicine_strength_id: '223e4567-e89b-12d3-a456-426614174001',
            quantity: 5,
            notes: 'Amoxicillin 250mg',
          },
        ],
        patient_name: 'Priya Sharma',
        reference_number: 'RX-DISP-892',
        reason: 'Prescription Dispense',
      };
      const result = batchDispenseSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects empty items in batch dispense', () => {
      const invalid = {
        items: [],
        patient_name: 'Priya',
      };
      expect(batchDispenseSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('queryAllHistorySchema', () => {
    it('accepts valid query filters', () => {
      const valid = {
        page: 1,
        limit: 25,
        search: 'Paracetamol',
        transaction_type: 'DISPENSE',
        start_date: '2026-11-01',
        end_date: '2026-11-30',
      };
      const result = queryAllHistorySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('stockInSchema', () => {
    it('accepts valid stock-in data', () => {
      const valid = {
        quantity: 100,
        unit_cost: 15.5,
        reference_number: 'INV-2026-9811',
        is_opening_stock: false,
        notes: 'Received in good condition.',
      };
      const result = stockInSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative quantity', () => {
      expect(stockInSchema.safeParse({ quantity: 0 }).success).toBe(false);
      expect(stockInSchema.safeParse({ quantity: -5 }).success).toBe(false);
    });

    it('rejects negative unit cost', () => {
      expect(stockInSchema.safeParse({ quantity: 10, unit_cost: -2 }).success).toBe(false);
    });

    it('rejects invalid reference number characters', () => {
      expect(
        stockInSchema.safeParse({
          quantity: 10,
          reference_number: 'INV @ 123 *',
        }).success,
      ).toBe(false);
    });
  });

  describe('stockOutSchema', () => {
    it('accepts valid stock-out data', () => {
      const valid = {
        quantity: 25,
        reference_number: 'DISP-4501',
        notes: 'Dispensed for internal clinic use',
      };
      const result = stockOutSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative quantity', () => {
      expect(stockOutSchema.safeParse({ quantity: 0 }).success).toBe(false);
      expect(stockOutSchema.safeParse({ quantity: -10 }).success).toBe(false);
    });
  });

  describe('adjustStockSchema', () => {
    it('accepts non-negative actual quantity with valid reason', () => {
      const valid = {
        actual_quantity: 45,
        reason: 'PHYSICAL_COUNT_RECONCILIATION',
        notes: 'Monthly physical audit reconciliation',
      };
      const result = adjustStockSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects negative actual quantity', () => {
      const result = adjustStockSchema.safeParse({
        actual_quantity: -1,
        reason: 'Audited count',
      });
      expect(result.success).toBe(false);
    });

    it('requires a clear reason with min 3 characters', () => {
      expect(adjustStockSchema.safeParse({ actual_quantity: 10, reason: '' }).success).toBe(false);
      expect(adjustStockSchema.safeParse({ actual_quantity: 10, reason: 'ab' }).success).toBe(false);
    });
  });

  describe('damagedStockSchema and returnStockSchema', () => {
    it('enforces valid damage reason enum', () => {
      expect(
        damagedStockSchema.safeParse({
          quantity: 5,
          reason: 'DAMAGED',
        }).success,
      ).toBe(true);

      expect(
        damagedStockSchema.safeParse({
          quantity: 5,
          reason: 'EXPIRED',
        }).success,
      ).toBe(true);

      expect(
        damagedStockSchema.safeParse({
          quantity: 5,
          reason: 'LOST',
        }).success,
      ).toBe(false);
    });

    it('validates return stock reason', () => {
      expect(
        returnStockSchema.safeParse({
          quantity: 5,
          reason: 'Patient adverse reaction return',
        }).success,
      ).toBe(true);

      expect(
        returnStockSchema.safeParse({
          quantity: 5,
          reason: '',
        }).success,
      ).toBe(false);
    });
  });

  describe('createMedicineStrengthSchema', () => {
    const validVariant = {
      medicineId: '123e4567-e89b-12d3-a456-426614174000',
      strength: '500',
      strength_unit: 'mg',
      dosage_form: 'Tablet',
      tablets_per_strip: 10,
      mrp: 50,
      discount_type: 'PERCENTAGE',
      discount_value: 10,
      purchase_price: 35,
      reorder_level: 10,
      variant_code: 'MED-PARA-500-T10',
      barcode: '8901234567890',
    };

    it('accepts valid variant data', () => {
      const res = createMedicineStrengthSchema.safeParse(validVariant);
      expect(res.success).toBe(true);
    });

    it('rejects percentage discount greater than 100%', () => {
      const invalid = { ...validVariant, discount_value: 105 };
      expect(createMedicineStrengthSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects flat discount greater than MRP', () => {
      const invalid = {
        ...validVariant,
        discount_type: 'FLAT',
        mrp: 50,
        discount_value: 60,
      };
      expect(createMedicineStrengthSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects invalid characters in strength or variant code', () => {
      expect(
        createMedicineStrengthSchema.safeParse({
          ...validVariant,
          strength: '500mg @ high',
        }).success,
      ).toBe(false);

      expect(
        createMedicineStrengthSchema.safeParse({
          ...validVariant,
          variant_code: 'VAR 001 #1',
        }).success,
      ).toBe(false);
    });
  });
});
