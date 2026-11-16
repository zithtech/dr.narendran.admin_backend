import { describe, expect, it } from 'vitest';
import { patientSchema } from '../../src/modules/patients/patients.schema.js';

describe('patientSchema validation', () => {
  const baseValidPatient = {
    hospital_id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Jane Doe',
    phone: '+919876543210',
    email: 'jane.doe@example.com',
    status: 'ACTIVE' as const,
    date_of_birth: '1995-05-15',
    gender: 'FEMALE',
    address_line_1: '456 Garden Street',
    address_line_2: 'Apartment 2B',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    height_cm: 165,
    weight_kg: 60,
    blood_group: 'B+',
    marital_status: 'Single',
  };

  it('validates a completely valid patient payload', () => {
    const parsed = patientSchema.safeParse(baseValidPatient);
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
        const res = patientSchema.safeParse({ ...baseValidPatient, phone });
        expect(res.success).toBe(true);
      }
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, phone: '98765abcde' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, phone: '98765@#$%' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('accepts null, empty string, or undefined for optional phone', () => {
      expect(patientSchema.safeParse({ ...baseValidPatient, phone: '' }).success).toBe(true);
      expect(patientSchema.safeParse({ ...baseValidPatient, phone: null }).success).toBe(true);
      const { phone: _, ...withoutPhone } = baseValidPatient;
      expect(patientSchema.safeParse(withoutPhone).success).toBe(true);
    });
  });

  describe('name validation (letters, spaces, periods, hyphens)', () => {
    it('accepts valid patient names', () => {
      const validNames = ['Jane Doe', 'Mary-Jane Watson', 'Dr. Smith Jr.', 'O\'Connor'.replace("'", '')];
      for (const name of validNames) {
        const res = patientSchema.safeParse({ ...baseValidPatient, name });
        expect(res.success).toBe(true);
      }
    });

    it('rejects empty or whitespace-only name', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, name: '   ' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Patient name is required');
      }
    });

    it('rejects name shorter than 2 characters', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, name: 'A' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('at least 2 characters');
      }
    });

    it('rejects name containing numbers', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, name: 'Jane 123' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters');
      }
    });

    it('rejects name containing special characters like @, $, #', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, name: 'Jane@Doe!' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters');
      }
    });
  });

  describe('pincode validation (5-10 digits)', () => {
    it('accepts valid 5 to 10 digit pincodes', () => {
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '600001' }).success).toBe(true);
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '12345' }).success).toBe(true);
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '1234567890' }).success).toBe(true);
    });

    it('rejects pincodes with letters or special characters', () => {
      const res1 = patientSchema.safeParse({ ...baseValidPatient, pincode: '60000A' });
      expect(res1.success).toBe(false);

      const res2 = patientSchema.safeParse({ ...baseValidPatient, pincode: '600-001' });
      expect(res2.success).toBe(false);
    });

    it('rejects pincodes with fewer than 5 or more than 10 digits', () => {
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '1234' }).success).toBe(false);
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '12345678901' }).success).toBe(false);
    });

    it('accepts null or empty string for pincode', () => {
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: '' }).success).toBe(true);
      expect(patientSchema.safeParse({ ...baseValidPatient, pincode: null }).success).toBe(true);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, and hyphens in city and state', () => {
      const res = patientSchema.safeParse({
        ...baseValidPatient,
        city: 'New-Delhi',
        state: 'Tamil Nadu',
      });
      expect(res.success).toBe(true);
    });

    it('rejects numbers or invalid special characters in city', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, city: 'City 123' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters and spaces');
      }
    });

    it('rejects numbers or invalid special characters in state', () => {
      const res = patientSchema.safeParse({ ...baseValidPatient, state: 'State #1' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters and spaces');
      }
    });
  });
});

