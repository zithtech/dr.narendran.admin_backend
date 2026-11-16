import { describe, expect, it } from 'vitest';

import { branchSchema } from '../../src/modules/hospital_branches/hospital_branches.schema.js';

describe('branchSchema validation', () => {
  const validBranch = {
    hospital_id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Apollo South Campus',
    phone: '+91 44 2829 0250',
    address_line_1: 'Block C, South Wing',
    address_line_2: 'Greams Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600006',
    address: 'Block C, South Wing, Greams Road, Chennai, Tamil Nadu, 600006',
    status: 'ACTIVE' as const,
  };

  it('validates a completely valid branch payload', () => {
    const result = branchSchema.safeParse(validBranch);
    expect(result.success).toBe(true);
  });

  describe('hospital_id validation', () => {
    it('requires a valid UUID for hospital_id', () => {
      const invalid = branchSchema.safeParse({ ...validBranch, hospital_id: 'invalid-id' });
      expect(invalid.success).toBe(false);

      const empty = branchSchema.safeParse({ ...validBranch, hospital_id: '' });
      expect(empty.success).toBe(false);
    });
  });

  describe('phone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      expect(branchSchema.safeParse({ ...validBranch, phone: '1234567' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, phone: '+1234567890' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, phone: '123456789012345' }).success).toBe(true);
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = branchSchema.safeParse({ ...validBranch, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = branchSchema.safeParse({ ...validBranch, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = branchSchema.safeParse({ ...validBranch, phone: '1234567abc' });
      expect(res.success).toBe(false);
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = branchSchema.safeParse({ ...validBranch, phone: '12345@67890' });
      expect(res.success).toBe(false);
    });

    it('accepts null, empty string, or undefined for optional phone', () => {
      expect(branchSchema.safeParse({ ...validBranch, phone: null }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, phone: '' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, phone: undefined }).success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('accepts valid branch names with numbers, letters, spaces, hyphens, ampersands', () => {
      expect(branchSchema.safeParse({ ...validBranch, name: 'Apollo Wing-2' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, name: "St. John's & Care Branch" }).success).toBe(true);
    });

    it('rejects empty or whitespace-only name', () => {
      expect(branchSchema.safeParse({ ...validBranch, name: '' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, name: '   ' }).success).toBe(false);
    });

    it('rejects name shorter than 2 characters', () => {
      expect(branchSchema.safeParse({ ...validBranch, name: 'A' }).success).toBe(false);
    });

    it('rejects name containing invalid special characters like @, $, !', () => {
      expect(branchSchema.safeParse({ ...validBranch, name: 'Branch @ South' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, name: 'Branch #1' }).success).toBe(false);
    });
  });

  describe('pincode validation (5-10 digits)', () => {
    it('accepts valid 5 to 10 digit pincodes', () => {
      expect(branchSchema.safeParse({ ...validBranch, pincode: '60000' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, pincode: '600006' }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, pincode: '1234567890' }).success).toBe(true);
    });

    it('rejects pincodes with letters or special characters', () => {
      expect(branchSchema.safeParse({ ...validBranch, pincode: '6000A' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, pincode: '600-06' }).success).toBe(false);
    });

    it('rejects pincodes with fewer than 5 or more than 10 digits', () => {
      expect(branchSchema.safeParse({ ...validBranch, pincode: '1234' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, pincode: '12345678901' }).success).toBe(false);
    });

    it('accepts null or empty string for pincode', () => {
      expect(branchSchema.safeParse({ ...validBranch, pincode: null }).success).toBe(true);
      expect(branchSchema.safeParse({ ...validBranch, pincode: '' }).success).toBe(true);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, and hyphens in city and state', () => {
      expect(branchSchema.safeParse({ ...validBranch, city: 'New-Delhi', state: 'Tamil Nadu' }).success).toBe(true);
    });

    it('rejects numbers or invalid special characters in city', () => {
      expect(branchSchema.safeParse({ ...validBranch, city: 'City123' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, city: 'City@West' }).success).toBe(false);
    });

    it('rejects numbers or invalid special characters in state', () => {
      expect(branchSchema.safeParse({ ...validBranch, state: 'State4' }).success).toBe(false);
      expect(branchSchema.safeParse({ ...validBranch, state: 'State#East' }).success).toBe(false);
    });
  });
});
