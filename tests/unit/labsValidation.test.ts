import { describe, expect, it } from 'vitest';

import { labSchema } from '../../src/modules/labs/labs.schema.js';

describe('labSchema validation', () => {
  const validLab = {
    name: 'Metropolis Diagnostics Center',
    phone: '+91 44 2829 0250',
    email: 'reports@metropolislab.com',
    address_line_1: 'Plot 42, Medical Enclave',
    address_line_2: 'Anna Nagar West',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600040',
    map_link: 'https://maps.google.com/?q=metropolis',
    start_time: '07:00',
    end_time: '21:00',
    services: ['srv-1', 'srv-2'],
    status: 'ACTIVE' as const,
  };

  it('validates a completely valid lab payload', () => {
    const result = labSchema.safeParse(validLab);
    expect(result.success).toBe(true);
  });

  describe('phone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      expect(labSchema.safeParse({ ...validLab, phone: '1234567' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, phone: '+1234567890' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, phone: '123456789012345' }).success).toBe(true);
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = labSchema.safeParse({ ...validLab, phone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = labSchema.safeParse({ ...validLab, phone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = labSchema.safeParse({ ...validLab, phone: '1234567abc' });
      expect(res.success).toBe(false);
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = labSchema.safeParse({ ...validLab, phone: '12345@67890' });
      expect(res.success).toBe(false);
    });

    it('accepts null, empty string, or undefined for optional phone', () => {
      expect(labSchema.safeParse({ ...validLab, phone: null }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, phone: '' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, phone: undefined }).success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('accepts valid lab names with numbers, letters, spaces, hyphens, ampersands', () => {
      expect(labSchema.safeParse({ ...validLab, name: 'Metropolis Lab-2' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, name: "St. Jude's & Care Lab" }).success).toBe(true);
    });

    it('rejects empty or whitespace-only name', () => {
      expect(labSchema.safeParse({ ...validLab, name: '' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, name: '   ' }).success).toBe(false);
    });

    it('rejects name shorter than 2 characters', () => {
      expect(labSchema.safeParse({ ...validLab, name: 'A' }).success).toBe(false);
    });

    it('rejects name containing invalid special characters like @, $, !', () => {
      expect(labSchema.safeParse({ ...validLab, name: 'Lab @ Anna Nagar' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, name: 'Lab #1' }).success).toBe(false);
    });
  });

  describe('pincode validation (5-10 digits)', () => {
    it('accepts valid 5 to 10 digit pincodes', () => {
      expect(labSchema.safeParse({ ...validLab, pincode: '60004' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, pincode: '600040' }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, pincode: '1234567890' }).success).toBe(true);
    });

    it('rejects pincodes with letters or special characters', () => {
      expect(labSchema.safeParse({ ...validLab, pincode: '6000A' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, pincode: '600-04' }).success).toBe(false);
    });

    it('rejects pincodes with fewer than 5 or more than 10 digits', () => {
      expect(labSchema.safeParse({ ...validLab, pincode: '1234' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, pincode: '12345678901' }).success).toBe(false);
    });

    it('accepts null or empty string for pincode', () => {
      expect(labSchema.safeParse({ ...validLab, pincode: null }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, pincode: '' }).success).toBe(true);
    });
  });

  describe('city and state validation', () => {
    it('accepts letters, spaces, and hyphens in city and state', () => {
      expect(labSchema.safeParse({ ...validLab, city: 'New-Delhi', state: 'Tamil Nadu' }).success).toBe(true);
    });

    it('rejects numbers or invalid special characters in city', () => {
      expect(labSchema.safeParse({ ...validLab, city: 'City123' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, city: 'City@West' }).success).toBe(false);
    });

    it('rejects numbers or invalid special characters in state', () => {
      expect(labSchema.safeParse({ ...validLab, state: 'State4' }).success).toBe(false);
      expect(labSchema.safeParse({ ...validLab, state: 'State#East' }).success).toBe(false);
    });
  });

  describe('email validation', () => {
    it('accepts valid email', () => {
      expect(labSchema.safeParse({ ...validLab, email: 'info@lab.com' }).success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(labSchema.safeParse({ ...validLab, email: 'invalid-email' }).success).toBe(false);
    });

    it('accepts null or empty string for email', () => {
      expect(labSchema.safeParse({ ...validLab, email: null }).success).toBe(true);
      expect(labSchema.safeParse({ ...validLab, email: '' }).success).toBe(true);
    });
  });
});

