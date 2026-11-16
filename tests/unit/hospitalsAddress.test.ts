import { describe, expect, it } from 'vitest';

describe('Hospital Address Logic Unit Test', () => {
  it('combines address components into single address string fallback', () => {
    const input = {
      name: 'City Care Hospital',
      address_line_1: '21 Greams Lane',
      address_line_2: 'Thousand Lights West',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600006',
      status: 'ACTIVE' as const,
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('21 Greams Lane, Thousand Lights West, Chennai, Tamil Nadu, 600006');
  });

  it('handles optional fields when computing fallback address', () => {
    const input = {
      name: 'City Care Clinic',
      address_line_1: 'Plot 4, Sector 7',
      address_line_2: null,
      city: 'Gurugram',
      state: null,
      pincode: '122001',
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('Plot 4, Sector 7, Gurugram, 122001');
  });
});

