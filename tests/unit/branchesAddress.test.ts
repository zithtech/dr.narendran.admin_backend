import { describe, expect, it } from 'vitest';

describe('Branch Address Logic Unit Test', () => {
  it('combines address components into single address string fallback', () => {
    const input = {
      hospital_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Apollo South Wing',
      address_line_1: 'Block C, South Wing',
      address_line_2: 'Opp City Hospital',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600006',
      status: 'ACTIVE' as const,
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('Block C, South Wing, Opp City Hospital, Chennai, Tamil Nadu, 600006');
  });

  it('handles optional fields cleanly in fallback address generation', () => {
    const input = {
      hospital_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Apollo Satellite Center',
      address_line_1: '14 Outer Ring Road',
      address_line_2: null,
      city: 'Bangalore',
      state: null,
      pincode: '560037',
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('14 Outer Ring Road, Bangalore, 560037');
  });
});

