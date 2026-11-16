import { describe, expect, it } from 'vitest';

import {
  createStaffSchema,
  staffEmailSchema,
  staffNameSchema,
  staffParamIdSchema,
  staffPhoneSchema,
  staffRoleSchema,
  updateStaffSchema,
} from '../../src/modules/staff/staff.schema.js';

describe('Staff Schema Validation', () => {
  const validStaff = {
    name: 'Sister Mary Joseph',
    phone: '+91 9876543210',
    email: 'mary@hospital.com',
    role: 'Senior Nurse',
    shiftTiming: 'Morning',
    joiningDate: '2025-01-15',
  };

  it('validates a completely valid staff payload', () => {
    const result = createStaffSchema.safeParse(validStaff);
    expect(result.success).toBe(true);
  });

  describe('staffNameSchema', () => {
    it('accepts valid names with letters, spaces, dots, hyphens, apostrophes', () => {
      const valid = ["Sister Mary Joseph", "Dr. Rajan", "O'Brien", "Mary-Jane"];
      for (const n of valid) {
        expect(staffNameSchema.safeParse(n).success, `Expected "${n}" to be valid`).toBe(true);
      }
    });

    it('rejects empty or whitespace-only name', () => {
      expect(staffNameSchema.safeParse('').success).toBe(false);
      expect(staffNameSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects name shorter than 2 characters', () => {
      const res = staffNameSchema.safeParse('A');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('at least 2 characters');
    });

    it('rejects name longer than 100 characters', () => {
      const res = staffNameSchema.safeParse('A'.repeat(101));
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('cannot exceed 100 characters');
    });

    it('rejects names with numbers', () => {
      expect(staffNameSchema.safeParse('Sister123').success).toBe(false);
      expect(staffNameSchema.safeParse('Nurse99').success).toBe(false);
    });

    it('rejects names with disallowed special characters', () => {
      expect(staffNameSchema.safeParse('Sister@Mary').success).toBe(false);
      expect(staffNameSchema.safeParse('Nurse#John').success).toBe(false);
    });
  });

  describe('staffPhoneSchema', () => {
    it('accepts valid phone numbers', () => {
      const valid = ['+91 9876543210', '9876543210', '+1-800-555-0100'];
      for (const p of valid) {
        expect(staffPhoneSchema.safeParse(p).success, `Expected "${p}" to be valid`).toBe(true);
      }
    });

    it('rejects empty phone', () => {
      expect(staffPhoneSchema.safeParse('').success).toBe(false);
    });

    it('rejects phone with letters', () => {
      const res = staffPhoneSchema.safeParse('abc9876543210');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('Letters are not allowed');
    });

    it('rejects phone with fewer than 10 digits', () => {
      const res = staffPhoneSchema.safeParse('12345');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('at least 10 digits');
    });

    it('rejects phone with more than 15 digits', () => {
      const res = staffPhoneSchema.safeParse('1234567890123456');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('cannot exceed 15 digits');
    });
  });

  describe('staffEmailSchema', () => {
    it('accepts valid email addresses', () => {
      expect(staffEmailSchema.safeParse('nurse@hospital.com').success).toBe(true);
      expect(staffEmailSchema.safeParse('dr.rajan@clinic.org').success).toBe(true);
    });

    it('accepts empty/undefined email (optional)', () => {
      expect(staffEmailSchema.safeParse('').success).toBe(true);
      expect(staffEmailSchema.safeParse(undefined).success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const res = staffEmailSchema.safeParse('not-an-email');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('valid email address');
    });
  });

  describe('staffRoleSchema', () => {
    it('accepts valid role strings', () => {
      expect(staffRoleSchema.safeParse('Senior Nurse').success).toBe(true);
      expect(staffRoleSchema.safeParse('Lab Technician').success).toBe(true);
      expect(staffRoleSchema.safeParse('Physiotherapist').success).toBe(true);
    });

    it('rejects empty role', () => {
      const res = staffRoleSchema.safeParse('');
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0]?.message).toContain('required');
    });
  });

  describe('updateStaffSchema', () => {
    it('allows partial update (only name)', () => {
      expect(updateStaffSchema.safeParse({ name: 'Rajan Kumar' }).success).toBe(true);
    });

    it('allows partial update (only phone)', () => {
      expect(updateStaffSchema.safeParse({ phone: '+91 9876543210' }).success).toBe(true);
    });

    it('rejects invalid name on update', () => {
      expect(updateStaffSchema.safeParse({ name: 'Nurse123' }).success).toBe(false);
    });
  });

  describe('staffParamIdSchema', () => {
    it('accepts valid UUID', () => {
      expect(staffParamIdSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
    });

    it('rejects non-UUID', () => {
      expect(staffParamIdSchema.safeParse({ id: 'invalid-id' }).success).toBe(false);
    });
  });
});
