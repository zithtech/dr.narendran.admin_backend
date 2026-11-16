import { describe, expect, it } from 'vitest';
import { hospitalSchema } from '../../src/modules/hospitals/hospitals.schema.js';

describe('hospitalSchema validation', () => {
  const baseValidHospital = {
    name: 'Apollo Multi-Specialty Hospital',
    phone: '+914428290200',
    email: 'contact@apollohospital.org',
    status: 'ACTIVE' as const,
    address_line_1: '21 Greams Lane',
    address_line_2: 'Thousand Lights',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600006',
  };

  it('validates a completely valid hospital payload', () => {
    const parsed = hospitalSchema.safeParse(baseValidHospital);
    expect(parsed.success).toBe(true);
  });

  describe('phone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      const validPhones = [
        '1234567', // 7 digits
        '9876543210', // 10 digits
        '+914428290200', // + prefix with 12 digits
        '123456789012345', // 15 digits
      ];
      for (const phone of validPhones) {
        const res = hospitalSchema.safeParse({ ...baseValidHospital, phone });
        expect(res.success).toBe(true);
      }
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, phone: '98765abcde' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, phone: '98765@#$%' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('accepts null, empty string, or undefined for optional phone', () => {
      expect(hospitalSchema.safeParse({ ...baseValidHospital, phone: '' }).success).toBe(true);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, phone: null }).success).toBe(true);
      const { phone: _, ...withoutPhone } = baseValidHospital;
      expect(hospitalSchema.safeParse(withoutPhone).success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('accepts valid hospital names with numbers, letters, spaces, hyphens, ampersands', () => {
      const validNames = [
        'Apollo Hospital',
        'St. John\'s Medical Center',
        'AIIMS New Delhi',
        'Fortis 7-Hills Hospital & Clinic',
      ];
      for (const name of validNames) {
        const res = hospitalSchema.safeParse({ ...baseValidHospital, name });
        expect(res.success).toBe(true);
      }
    });

    it('rejects empty or whitespace-only name', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, name: '   ' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Hospital name is required');
      }
    });

    it('rejects name shorter than 2 characters', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, name: 'A' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('at least 2 characters');
      }
    });

    it('rejects name containing invalid special characters like @, $, !', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, name: 'Apollo @ Hospital!' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('invalid characters');
      }
    });
  });

  describe('pincode validation (5-10 digits)', () => {
    it('accepts valid 5 to 10 digit pincodes', () => {
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '600006' }).success).toBe(true);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '12345' }).success).toBe(true);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '1234567890' }).success).toBe(true);
    });

    it('rejects pincodes with letters or special characters', () => {
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '60000A' }).success).toBe(false);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '600-006' }).success).toBe(false);
    });

    it('rejects pincodes with fewer than 5 or more than 10 digits', () => {
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '1234' }).success).toBe(false);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '12345678901' }).success).toBe(false);
    });

    it('accepts null or empty string for pincode', () => {
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: '' }).success).toBe(true);
      expect(hospitalSchema.safeParse({ ...baseValidHospital, pincode: null }).success).toBe(true);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, and hyphens in city and state', () => {
      const res = hospitalSchema.safeParse({
        ...baseValidHospital,
        city: 'New-Delhi',
        state: 'Tamil Nadu',
      });
      expect(res.success).toBe(true);
    });

    it('rejects numbers or invalid special characters in city', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, city: 'City 123' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters and spaces');
      }
    });

    it('rejects numbers or invalid special characters in state', () => {
      const res = hospitalSchema.safeParse({ ...baseValidHospital, state: 'State #1' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters and spaces');
      }
    });
  });
});

