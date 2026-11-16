import { describe, expect, it } from 'vitest';

import {
  createLabServiceSchema,
  labServiceNameSchema,
  labServiceParamIdSchema,
  updateLabServiceSchema,
} from '../../src/modules/lab-services/lab-services.schema.js';

describe('Lab Services Schema Validation', () => {
  const validService = {
    name: 'Complete Blood Count (CBC)',
    status: 'ACTIVE' as const,
  };

  it('validates a completely valid lab service payload', () => {
    const result = createLabServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Complete Blood Count (CBC)');
      expect(result.data.status).toBe('ACTIVE');
    }
  });

  it('accepts valid clinical investigation names with punctuation', () => {
    const names = [
      'HbA1c (Glycated Hemoglobin)',
      'COVID-19 RT-PCR Test',
      'Vitamin D3 (25-OH)',
      'Liver Function Test (LFT) / Bilirubin',
      'Blood Group & Rh Typing (ABO/Rh+)',
      'Urine Routine & Microscopic Examination',
      "Ziehl-Neelsen's Staining",
      'Serum Protein Electrophoresis (SPEP %)',
    ];

    for (const name of names) {
      const res = createLabServiceSchema.safeParse({ name, status: 'ACTIVE' });
      expect(res.success, `Expected "${name}" to be valid`).toBe(true);
    }
  });

  describe('labServiceNameSchema validation', () => {
    it('rejects empty or whitespace-only name', () => {
      expect(labServiceNameSchema.safeParse('').success).toBe(false);
      expect(labServiceNameSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects names shorter than 2 characters', () => {
      const res = labServiceNameSchema.safeParse('A');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('at least 2 characters');
      }
    });

    it('rejects names longer than 150 characters', () => {
      const res = labServiceNameSchema.safeParse('A'.repeat(151));
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('cannot exceed 150 characters');
      }
    });

    it('rejects invalid characters in test name', () => {
      const invalidNames = [
        '<script>alert(1)</script>',
        'CBC $ Special',
        'Test @ Home',
        'Profile #1',
        'Test ^ Care',
        'Test ~ Care',
        'Test {Curly}',
      ];

      for (const name of invalidNames) {
        const res = labServiceNameSchema.safeParse(name);
        expect(res.success, `Expected "${name}" to be rejected`).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0]?.message).toContain('invalid characters');
        }
      }
    });
  });

  describe('status enum validation', () => {
    it('accepts ACTIVE and INACTIVE', () => {
      expect(createLabServiceSchema.safeParse({ name: 'Lipid Profile', status: 'ACTIVE' }).success).toBe(true);
      expect(createLabServiceSchema.safeParse({ name: 'Lipid Profile', status: 'INACTIVE' }).success).toBe(true);
    });

    it('defaults status to ACTIVE if omitted', () => {
      const res = createLabServiceSchema.safeParse({ name: 'Lipid Profile' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe('ACTIVE');
      }
    });

    it('rejects invalid status', () => {
      const res = createLabServiceSchema.safeParse({ name: 'Lipid Profile', status: 'PENDING' });
      expect(res.success).toBe(false);
    });
  });

  describe('updateLabServiceSchema validation', () => {
    it('validates update service payload', () => {
      const res = updateLabServiceSchema.safeParse({
        name: 'Thyroid Stimulating Hormone (TSH)',
        status: 'INACTIVE',
      });
      expect(res.success).toBe(true);
    });

    it('rejects update with invalid name', () => {
      const res = updateLabServiceSchema.safeParse({
        name: 'T',
        status: 'ACTIVE',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('labServiceParamIdSchema validation', () => {
    it('accepts valid UUID', () => {
      const res = labServiceParamIdSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' });
      expect(res.success).toBe(true);
    });

    it('rejects non-UUID', () => {
      const res = labServiceParamIdSchema.safeParse({ id: 'invalid-id' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('Invalid service ID');
      }
    });
  });
});

