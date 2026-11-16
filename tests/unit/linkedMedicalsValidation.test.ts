import { describe, expect, it } from 'vitest';

import { linkedMedicalSchema } from '../../src/modules/linked_medicals/linked_medicals.schema.js';

describe('linkedMedicalSchema validation', () => {
  const validMedical = {
    name: 'Apollo Pharmacy Greams Road',
    phone: '+91 44 2829 0250',
    email: 'orders@apollopharmacy.com',
    address_line_1: 'Shop No. 12, Ground Floor',
    address_line_2: 'Near Apollo Main Hospital',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600006',
    map_link: 'https://maps.google.com/?q=apollo+greams',
    start_time: '08:00',
    end_time: '23:00',
    status: 'ACTIVE' as const,
  };

  it('validates a completely valid linked medical payload', () => {
    const result = linkedMedicalSchema.safeParse(validMedical);
    expect(result.success).toBe(true);
  });

  describe('phone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: '1234567' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: '+1234567890' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: '123456789012345' }).success).toBe(true);
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = linkedMedicalSchema.safeParse({ ...validMedical, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = linkedMedicalSchema.safeParse({ ...validMedical, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = linkedMedicalSchema.safeParse({ ...validMedical, phone: '1234567abc' });
      expect(res.success).toBe(false);
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = linkedMedicalSchema.safeParse({ ...validMedical, phone: '12345@67890' });
      expect(res.success).toBe(false);
    });

    it('accepts null, empty string, or undefined for optional phone', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: null }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: '' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, phone: undefined }).success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('accepts valid pharmacy names with numbers, letters, spaces, hyphens, ampersands', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: 'Apollo Pharmacy-2' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: "St. Jude's & Care Pharmacy" }).success).toBe(true);
    });

    it('rejects empty or whitespace-only name', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: '' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: '   ' }).success).toBe(false);
    });

    it('rejects name shorter than 2 characters', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: 'A' }).success).toBe(false);
    });

    it('rejects name containing invalid special characters like @, $, !', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: 'Pharmacy @ Greams Road' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, name: 'Pharmacy #1' }).success).toBe(false);
    });
  });

  describe('pincode validation (5-10 digits)', () => {
    it('accepts valid 5 to 10 digit pincodes', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '60000' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '600006' }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '1234567890' }).success).toBe(true);
    });

    it('rejects pincodes with letters or special characters', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '6000A' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '600-06' }).success).toBe(false);
    });

    it('rejects pincodes with fewer than 5 or more than 10 digits', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '1234' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '12345678901' }).success).toBe(false);
    });

    it('accepts null or empty string for pincode', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: null }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, pincode: '' }).success).toBe(true);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, and hyphens in city and state', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, city: 'New-Delhi', state: 'Tamil Nadu' }).success).toBe(true);
    });

    it('rejects numbers or invalid special characters in city', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, city: 'City123' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, city: 'City@West' }).success).toBe(false);
    });

    it('rejects numbers or invalid special characters in state', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, state: 'State4' }).success).toBe(false);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, state: 'State#East' }).success).toBe(false);
    });
  });

  describe('email validation', () => {
    it('accepts valid email', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, email: 'info@pharmacy.com' }).success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, email: 'invalid-email' }).success).toBe(false);
    });

    it('accepts null or empty string for email', () => {
      expect(linkedMedicalSchema.safeParse({ ...validMedical, email: null }).success).toBe(true);
      expect(linkedMedicalSchema.safeParse({ ...validMedical, email: '' }).success).toBe(true);
    });
  });
});

