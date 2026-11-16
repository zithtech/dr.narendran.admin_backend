import { describe, expect, it, vi } from 'vitest';

import { formatDoctorInfo } from '../../src/modules/doctors/doctors.service.js';

describe('Doctor Address Fields Unit Test', () => {
  it('formats doctor info with address lines, city, state, pincode and clinic_address', () => {
    const row = {
      id: 'doc-123',
      name: 'Dr. Jane Smith',
      specialization: 'Neurology',
      hospital_id: 'hosp-1',
      branch_id: 'branch-1',
      qualification: 'MBBS, MD',
      medical_registration_number: 'REG-98765',
      address_line_1: 'Suite 302, Medical Wing',
      address_line_2: 'Block C, Opp City Park',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600028',
      clinic_address: 'Suite 302, Medical Wing, Block C, Opp City Park, Chennai, Tamil Nadu, 600028',
      experience_years: 10,
      status: 'ACTIVE',
      is_active: true,
      locations_count: 1,
      average_rating: '4.9',
      total_reviews: 24,
    };

    const formatted = formatDoctorInfo(row);

    expect(formatted.address_line_1).toBe('Suite 302, Medical Wing');
    expect(formatted.address_line_2).toBe('Block C, Opp City Park');
    expect(formatted.city).toBe('Chennai');
    expect(formatted.state).toBe('Tamil Nadu');
    expect(formatted.pincode).toBe('600028');
    expect(formatted.clinic_address).toBe(
      'Suite 302, Medical Wing, Block C, Opp City Park, Chennai, Tamil Nadu, 600028',
    );
  });

  it('handles null/missing address fields cleanly in formatDoctorInfo', () => {
    const row = {
      id: 'doc-456',
      name: 'Dr. Robert Brown',
      specialization: 'Cardiology',
    };

    const formatted = formatDoctorInfo(row);

    expect(formatted.address_line_1).toBeNull();
    expect(formatted.address_line_2).toBeNull();
    expect(formatted.city).toBeNull();
    expect(formatted.state).toBeNull();
    expect(formatted.pincode).toBeNull();
  });
});

