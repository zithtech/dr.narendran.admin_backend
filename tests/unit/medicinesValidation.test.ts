import { describe, expect, it } from 'vitest';
import {
  createMedicineSchema,
  updateMedicineSchema,
} from '../../src/modules/medicines/medicines.schema.js';

describe('Medicines Validation Schema (Pharmacy Management)', () => {
  describe('createMedicineSchema', () => {
    it('accepts valid medicine data', () => {
      const valid = {
        medicineName: 'Paracetamol 500mg Tablet',
        genericName: 'Paracetamol (Acetaminophen)',
        strength: '500',
        strengthUnit: 'mg',
        dosageForm: 'Tablet',
        therapeuticCategory: 'Analgesics / Antipyretic',
        subCategory: 'Pain Relief / Antipyretic',
        manufacturer: 'Cipla Ltd.',
        prescriptionRequired: false,
        status: 'Active',
        medicineCode: 'MED-PARA-500',
        barcode: '8901234567890',
        mrp: 35.5,
        discountType: 'Percentage',
        discountValue: 10,
        finalPrice: 31.95,
        frequency: '1-0-1',
        duration: '5 days',
        description: 'Take after meals with water.',
      };

      const result = createMedicineSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    describe('medicineName validation', () => {
      it('rejects missing or empty medicineName', () => {
        expect(createMedicineSchema.safeParse({}).success).toBe(false);
        expect(createMedicineSchema.safeParse({ medicineName: '' }).success).toBe(false);
        expect(createMedicineSchema.safeParse({ medicineName: '   ' }).success).toBe(false);
      });

      it('enforces min 2 chars and max 150 chars', () => {
        expect(createMedicineSchema.safeParse({ medicineName: 'A' }).success).toBe(false);
        expect(createMedicineSchema.safeParse({ medicineName: 'Ab' }).success).toBe(true);
        expect(createMedicineSchema.safeParse({ medicineName: 'A'.repeat(151) }).success).toBe(false);
      });

      it('rejects disallowed special characters', () => {
        expect(createMedicineSchema.safeParse({ medicineName: 'Paracetamol @ 500' }).success).toBe(false);
        expect(createMedicineSchema.safeParse({ medicineName: 'Paracetamol #1' }).success).toBe(false);
        expect(createMedicineSchema.safeParse({ medicineName: 'Paracetamol *' }).success).toBe(false);
      });

      it('accepts valid clinical characters (plus, slash, parentheses, commas, dots)', () => {
        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Amoxicillin + Clavulanic Acid (500mg/125mg)',
          }).success,
        ).toBe(true);
      });
    });

    describe('subCategory validation', () => {
      it('rejects numbers in sub category', () => {
        const result = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          subCategory: 'Antibiotics 123',
        });
        expect(result.success).toBe(false);
      });

      it('rejects invalid special characters in sub category', () => {
        const result = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          subCategory: 'Antibiotics @ Eye',
        });
        expect(result.success).toBe(false);
      });

      it('accepts letters, spaces, hyphens, and slashes', () => {
        const result = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          subCategory: 'ENT / Eye-Care',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('pricing & discount validation', () => {
      it('rejects negative MRP and discount values', () => {
        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Test Med',
            mrp: -10,
          }).success,
        ).toBe(false);

        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Test Med',
            mrp: 100,
            discountValue: -5,
          }).success,
        ).toBe(false);
      });

      it('rejects percentage discount greater than 100%', () => {
        const result = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          mrp: 100,
          discountType: 'Percentage',
          discountValue: 105,
        });
        expect(result.success).toBe(false);
      });

      it('rejects fixed discount greater than MRP', () => {
        const result = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          mrp: 100,
          discountType: 'Fixed Amount',
          discountValue: 120,
        });
        expect(result.success).toBe(false);
      });

      it('accepts valid discount when within limits', () => {
        const result1 = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          mrp: 100,
          discountType: 'Percentage',
          discountValue: 20,
        });
        expect(result1.success).toBe(true);

        const result2 = createMedicineSchema.safeParse({
          medicineName: 'Test Med',
          mrp: 100,
          discountType: 'Fixed Amount',
          discountValue: 25,
        });
        expect(result2.success).toBe(true);
      });
    });

    describe('code & barcode validation', () => {
      it('rejects invalid characters in medicineCode and barcode', () => {
        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Test Med',
            medicineCode: 'MED @ 001',
          }).success,
        ).toBe(false);

        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Test Med',
            barcode: '890123!45',
          }).success,
        ).toBe(false);
      });

      it('accepts valid alphanumeric codes with allowed separators', () => {
        expect(
          createMedicineSchema.safeParse({
            medicineName: 'Test Med',
            medicineCode: 'MED_PARA-500',
            barcode: '890123456789-0',
          }).success,
        ).toBe(true);
      });
    });
  });

  describe('updateMedicineSchema', () => {
    it('fails when body is empty', () => {
      expect(updateMedicineSchema.safeParse({}).success).toBe(false);
    });

    it('validates updated fields correctly', () => {
      expect(updateMedicineSchema.safeParse({ medicineName: 'New Name' }).success).toBe(true);
      expect(updateMedicineSchema.safeParse({ medicineName: 'N' }).success).toBe(false);
      expect(updateMedicineSchema.safeParse({ mrp: -50 }).success).toBe(false);
    });
  });
});

