import { describe, expect, it } from 'vitest';
import { doctorSchema } from '../../src/modules/doctors/doctors.schema.js';

describe('doctorSchema validation', () => {
  const baseValidDoctor = {
    name: 'Dr. John Doe',
    phone: '+919876543210',
    email: 'john.doe@example.com',
    specialization: 'Cardiology',
    status: 'ACTIVE' as const,
    qualification: 'MBBS, MD',
    medical_registration_number: 'REG-12345/TN',
    address_line_1: '123 Health Ave',
    address_line_2: 'Suite 400',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    years_of_experience: 12,
  };

  it('validates a completely valid doctor payload', () => {
    const parsed = doctorSchema.safeParse(baseValidDoctor);
    expect(parsed.success).toBe(true);
  });

  describe('phone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      const validPhones = [
        '1234567', // 7 digits
        '9876543210', // 10 digits
        '+919876543210', // + prefix with 12 digits
        '123456789012345', // 15 digits
      ];
      for (const phone of validPhones) {
        const res = doctorSchema.safeParse({ ...baseValidDoctor, phone });
        expect(res.success).toBe(true);
      }
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, phone: '98765abcde' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('rejects phone numbers with special characters other than +', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, phone: '98765@4321' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });
  });

  describe('name validation', () => {
    it('accepts letters, spaces, hyphens, and periods', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, name: 'Dr. Jane-Anne Smith' });
      expect(res.success).toBe(true);
    });

    it('rejects names with numbers or symbols', () => {
      const invalidNames = ['Dr. John 2nd', 'Dr. John #1', 'Dr. Smith@Home'];
      for (const name of invalidNames) {
        const res = doctorSchema.safeParse({ ...baseValidDoctor, name });
        expect(res.success).toBe(false);
        if (!res.success && res.error) {
          expect(res.error.issues[0]?.message).toContain('Doctor name can only contain letters, spaces, hyphens, and periods');
        }
      }
    });

    it('rejects names shorter than 2 characters', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, name: 'A' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('at least 2 characters');
      }
    });
  });

  describe('pincode validation (5 to 10 digits)', () => {
    it('accepts 5 to 10 digit numbers', () => {
      const validPins = ['60001', '600001', '1234567890'];
      for (const pincode of validPins) {
        const res = doctorSchema.safeParse({ ...baseValidDoctor, pincode });
        expect(res.success).toBe(true);
      }
    });

    it('rejects pincodes with letters or less than 5 digits', () => {
      const invalidPins = ['1234', '60000A', '60-001', '12345678901'];
      for (const pincode of invalidPins) {
        const res = doctorSchema.safeParse({ ...baseValidDoctor, pincode });
        expect(res.success).toBe(false);
        if (!res.success && res.error) {
          expect(res.error.issues[0]?.message).toContain('Pincode must be between 5 and 10 digits');
        }
      }
    });
  });

  describe('years_of_experience validation', () => {
    it('accepts valid range 0 to 70', () => {
      expect(doctorSchema.safeParse({ ...baseValidDoctor, years_of_experience: 0 }).success).toBe(true);
      expect(doctorSchema.safeParse({ ...baseValidDoctor, years_of_experience: 70 }).success).toBe(true);
    });

    it('rejects negative or excessive experience', () => {
      expect(doctorSchema.safeParse({ ...baseValidDoctor, years_of_experience: -1 }).success).toBe(false);
      expect(doctorSchema.safeParse({ ...baseValidDoctor, years_of_experience: 75 }).success).toBe(false);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, hyphens', () => {
      const res = doctorSchema.safeParse({ ...baseValidDoctor, city: 'New Delhi', state: 'Tamil-Nadu' });
      expect(res.success).toBe(true);
    });

    it('rejects numbers in city or state', () => {
      expect(doctorSchema.safeParse({ ...baseValidDoctor, city: 'Sector 12' }).success).toBe(false);
      expect(doctorSchema.safeParse({ ...baseValidDoctor, state: 'State 1' }).success).toBe(false);
    });
  });
});
