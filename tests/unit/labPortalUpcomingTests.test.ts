import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pool } from '../../src/db/pool.js';
import { labPortalService } from '../../src/modules/lab_portal/lab_portal.service.js';

describe('LabPortalService - getUpcomingTests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid lab UUID', async () => {
    await expect(labPortalService.getUpcomingTests('invalid-uuid')).rejects.toThrow('Invalid lab ID.');
  });

  it('queries upcoming tests using correct SQL without invalid appt.patient_email column', async () => {
    const validLabId = '11111111-1111-1111-1111-111111111111';
    let executedQuery = '';

    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      executedQuery = queryText;
      return Promise.resolve({
        rows: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            prescription_id: '33333333-3333-3333-3333-333333333333',
            patient_id: '44444444-4444-4444-4444-444444444444',
            lab_test_id: '55555555-5555-5555-5555-555555555555',
            test_name: 'Complete Blood Count (CBC)',
            instructions: 'Fasting 12 hours',
            created_at: new Date('2026-11-23T10:00:00Z'),
            updated_at: new Date('2026-11-23T10:00:00Z'),
            lab_id: validLabId,
            prescription_date: '2026-11-23',
            doctor_id: '66666666-6666-6666-6666-666666666666',
            additional_notes: 'Check platelets',
            consultation_purpose: 'Routine checkup',
            doctor_name: 'Dr. Narendran',
            doctor_specialization: 'Oncologist',
            patient_name: 'Bharathi',
            patient_phone: '+919361050733',
            patient_email: 'bharathi2004m@gmail.com',
            patient_gender: 'Female',
            patient_dob: '2004-05-15',
            test_category: 'Hematology',
            lab_name: 'Raj Lab',
          },
        ],
      });
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

    const result = await labPortalService.getUpcomingTests(validLabId);

    // Verify SQL does NOT contain appt.patient_email which broke in Postgres
    expect(executedQuery).not.toContain('appt.patient_email');
    expect(executedQuery).toContain('pt.email as patient_email');
    expect(mockClient.release).toHaveBeenCalled();

    // Verify row mapping
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: '22222222-2222-2222-2222-222222222222',
      prescription_id: '33333333-3333-3333-3333-333333333333',
      patient_id: '44444444-4444-4444-4444-444444444444',
      patient_name: 'Bharathi',
      patient_phone: '+919361050733',
      patient_email: 'bharathi2004m@gmail.com',
      patient_gender: 'Female',
      patient_dob: '2004-05-15',
      doctor_id: '66666666-6666-6666-6666-666666666666',
      doctor_name: 'Dr. Narendran',
      doctor_specialization: 'Oncologist',
      test_name: 'Complete Blood Count (CBC)',
      test_category: 'Hematology',
      instructions: 'Fasting 12 hours',
      prescription_date: '2026-11-23',
      scheduled_date: '2026-11-23',
      status: 'Upcoming',
      diagnosis: 'Routine checkup',
      notes: 'Check platelets',
      lab_id: validLabId,
      lab_name: 'Raj Lab',
    });
  });
});

