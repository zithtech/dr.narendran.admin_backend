import { describe, expect, it } from 'vitest';

describe('Staff Address Logic Unit Test', () => {
  it('combines address components into single address string fallback', () => {
    const input = {
      name: 'Sister Mary Joseph',
      address_line_1: '12 Health Colony',
      address_line_2: 'Block A, Flat 4',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600028',
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('12 Health Colony, Block A, Flat 4, Chennai, Tamil Nadu, 600028');
  });

  it('handles optional fields cleanly in fallback address generation', () => {
    const input = {
      name: 'Rajesh Kumar',
      address_line_1: 'Plot 45, Gandhi Nagar',
      address_line_2: null,
      city: 'Madurai',
      state: null,
      pincode: '625020',
    };

    const address =
      [input.address_line_1, input.address_line_2, input.city, input.state, input.pincode]
        .filter(Boolean)
        .join(', ') || null;

    expect(address).toBe('Plot 45, Gandhi Nagar, Madurai, 625020');
  });
});

