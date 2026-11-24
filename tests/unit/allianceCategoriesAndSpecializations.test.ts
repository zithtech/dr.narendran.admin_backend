import { describe, expect, it } from 'vitest';
import {
  createAllianceCategorySchema,
  updateAllianceCategorySchema,
} from '@/modules/alliances/allianceCategories.schema.js';
import {
  createAllianceSpecializationSchema,
  updateAllianceSpecializationSchema,
} from '@/modules/alliances/allianceSpecializations.schema.js';

describe('Alliance Categories & Specializations Validation', () => {
  describe('createAllianceCategorySchema', () => {
    it('accepts valid category input', () => {
      const valid = {
        name: 'Cardiology Specialist',
        description: 'Heart and vascular diseases',
        status: 'ACTIVE',
      };
      const parsed = createAllianceCategorySchema.parse(valid);
      expect(parsed.name).toBe('Cardiology Specialist');
      expect(parsed.status).toBe('ACTIVE');
    });

    it('rejects empty category name', () => {
      expect(() =>
        createAllianceCategorySchema.parse({ name: '   ' }),
      ).toThrow();
    });

    it('defaults status to ACTIVE if omitted', () => {
      const parsed = createAllianceCategorySchema.parse({ name: 'Neurology' });
      expect(parsed.status).toBe('ACTIVE');
    });
  });

  describe('createAllianceSpecializationSchema', () => {
    it('accepts valid specialization input', () => {
      const valid = {
        name: 'Interventional Cardiology',
        description: 'Catheter-based treatment of heart disease',
        status: 'ACTIVE',
      };
      const parsed = createAllianceSpecializationSchema.parse(valid);
      expect(parsed.name).toBe('Interventional Cardiology');
      expect(parsed.status).toBe('ACTIVE');
    });

    it('rejects empty specialization name', () => {
      expect(() =>
        createAllianceSpecializationSchema.parse({ name: '' }),
      ).toThrow();
    });

    it('validates partial update schema', () => {
      const parsed = updateAllianceSpecializationSchema.parse({
        status: 'INACTIVE',
      });
      expect(parsed.status).toBe('INACTIVE');
      expect(parsed.name).toBeUndefined();
    });
  });
});

