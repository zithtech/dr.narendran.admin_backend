import { describe, expect, it } from 'vitest';
import { createAppointmentSchema, updateAppointmentSchema } from '../../src/modules/appointments/appointments.schema.js';

describe('Appointments schema validation', () => {
  const baseValidAppointment = {
    purpose: 'Cardiology Consultation',
    doctorId: '123e4567-e89b-12d3-a456-426614174000',
    patientId: '123e4567-e89b-12d3-a456-426614174001',
    patientName: 'Jane Doe',
    patientPhone: '+919876543210',
    patientNote: 'First time consultation for chest discomfort.',
  };

  it('validates a completely valid appointment payload', () => {
    const parsed = createAppointmentSchema.safeParse(baseValidAppointment);
    expect(parsed.success).toBe(true);
  });

  describe('patientPhone validation (7-15 digits, no letters or special chars)', () => {
    it('accepts phone numbers between 7 and 15 digits', () => {
      const validPhones = [
        '1234567', // 7 digits
        '9876543210', // 10 digits
        '+919876543210', // + prefix with 12 digits
        '123456789012345', // 15 digits
      ];
      for (const patientPhone of validPhones) {
        const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone });
        expect(res.success).toBe(true);
      }
    });

    it('rejects phone numbers with fewer than 7 digits', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: '123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with more than 15 digits', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: '1234567890123456' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('between 7 and 15 digits');
      }
    });

    it('rejects phone numbers with letters', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: '98765abcde' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('rejects phone numbers with invalid special characters', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: '98765@#$%' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Phone number cannot contain letters or special characters');
      }
    });

    it('accepts null, empty string, or undefined for optional patient phone', () => {
      expect(createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: '' }).success).toBe(true);
      expect(createAppointmentSchema.safeParse({ ...baseValidAppointment, patientPhone: null }).success).toBe(true);
      const { patientPhone: _, ...withoutPhone } = baseValidAppointment;
      expect(createAppointmentSchema.safeParse(withoutPhone).success).toBe(true);
    });
  });

  describe('patientName validation (letters, spaces, periods, hyphens)', () => {
    it('accepts valid patient names', () => {
      const validNames = ['Jane Doe', 'Mary-Jane Watson', 'Dr. Smith Jr.', 'A. B. C. Raman'];
      for (const patientName of validNames) {
        const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName });
        expect(res.success).toBe(true);
      }
    });

    it('rejects name shorter than 2 characters when provided', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName: 'A' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('at least 2 characters');
      }
    });

    it('rejects name exceeding 100 characters', () => {
      const res = createAppointmentSchema.safeParse({
        ...baseValidAppointment,
        patientName: 'A'.repeat(101),
      });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('cannot exceed 100 characters');
      }
    });

    it('rejects name containing numbers', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName: 'Jane 123' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters');
      }
    });

    it('rejects name containing special characters like @, $, #', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName: 'Jane@Doe!' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('only contain letters');
      }
    });

    it('accepts null, empty string, or undefined for optional patient name', () => {
      expect(createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName: '' }).success).toBe(true);
      expect(createAppointmentSchema.safeParse({ ...baseValidAppointment, patientName: null }).success).toBe(true);
      const { patientName: _, ...withoutName } = baseValidAppointment;
      expect(createAppointmentSchema.safeParse(withoutName).success).toBe(true);
    });
  });

  describe('purpose and note validation', () => {
    it('requires purpose', () => {
      const res = createAppointmentSchema.safeParse({ ...baseValidAppointment, purpose: '   ' });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('Purpose is required');
      }
    });

    it('rejects purpose exceeding 255 characters', () => {
      const res = createAppointmentSchema.safeParse({
        ...baseValidAppointment,
        purpose: 'A'.repeat(256),
      });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('cannot exceed 255 characters');
      }
    });

    it('rejects note exceeding 500 characters', () => {
      const res = createAppointmentSchema.safeParse({
        ...baseValidAppointment,
        patientNote: 'A'.repeat(501),
      });
      expect(res.success).toBe(false);
      if (!res.success && res.error) {
        expect(res.error.issues[0]?.message).toContain('under 500 characters');
      }
    });
  });

  describe('updateAppointmentSchema validation', () => {
    it('validates partial updates with valid patient phone and name', () => {
      const res = updateAppointmentSchema.safeParse({
        patientName: 'Jane Smith',
        patientPhone: '+919876543210',
        purpose: 'Follow up',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid phone in update payload', () => {
      const res = updateAppointmentSchema.safeParse({
        patientPhone: '12345',
      });
      expect(res.success).toBe(false);
    });

    it('rejects invalid name with numbers in update payload', () => {
      const res = updateAppointmentSchema.safeParse({
        patientName: 'Jane 2nd',
      });
      expect(res.success).toBe(false);
    });
  });
});

