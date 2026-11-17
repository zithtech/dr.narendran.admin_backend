import { describe, expect, it } from 'vitest';
import {
  generatePasswordResetEmailHtml,
  generatePasswordResetEmailText,
} from '../../src/templates/passwordResetEmail.js';

describe('Password Reset Professional Email Templates', () => {
  it('generates professional HTML email with hospital branding, button, and security notice', () => {
    const html = generatePasswordResetEmailHtml({
      name: 'Dr. Subhalakshmi Vinayagam',
      resetUrl: 'https://hms.drnarendran.com/reset-password?token=sample-test-token-12345',
      expiresMinutes: 30,
    });

    // Hospital branding
    expect(html).toContain('Dr. Narendran HMS');
    expect(html).toContain('Clinical Management & Practitioner Portal');

    // Security badge & greeting
    expect(html).toContain('Security Notification');
    expect(html).toContain('Dr. Subhalakshmi Vinayagam');

    // CTA Button
    expect(html).toContain('https://hms.drnarendran.com/reset-password?token=sample-test-token-12345');
    expect(html).toContain('Reset My Password');

    // Expiration and single-use security terms
    expect(html).toContain('30 minutes');
    expect(html).toContain('can only be used once');

    // Fallback URL container & safety guidance
    expect(html).toContain('If the button above does not work');
    expect(html).toContain('Did not request this change?');

    // Footer
    expect(html).toContain('Clinical Management & Practitioner Portal');
    expect(html).toContain(String(new Date().getFullYear()));
  });

  it('renders custom hospital logo and name when provided', () => {
    const html = generatePasswordResetEmailHtml({
      name: 'Dr. John Doe',
      resetUrl: 'https://hms.example.com/reset-password?token=custom-token-999',
      expiresMinutes: 15,
      hospitalName: 'Apollo Speciality Hospitals',
      hospitalSubtext: 'Center of Excellence in Clinical Healthcare',
      logoUrl: 'https://hms.example.com/assets/apollo-logo.png',
    });

    expect(html).toContain('Apollo Speciality Hospitals');
    expect(html).toContain('Center of Excellence in Clinical Healthcare');
    expect(html).toContain('https://hms.example.com/assets/apollo-logo.png');
    expect(html).toContain('alt="Apollo Speciality Hospitals Logo"');
    expect(html).toContain('Hello <strong>Dr. John Doe</strong>');
    expect(html).toContain('15 minutes');
  });

  it('generates clean plain-text fallback', () => {
    const text = generatePasswordResetEmailText({
      name: 'Dr. Narendran',
      resetUrl: 'https://hms.drnarendran.com/reset-password?token=sample-test-token-12345',
      expiresMinutes: 30,
    });

    expect(text).toContain('Hello Dr. Narendran,');
    expect(text).toContain('https://hms.drnarendran.com/reset-password?token=sample-test-token-12345');
    expect(text).toContain('30 minutes');
    expect(text).toContain('Dr. Narendran Hospital Management System');
  });
});
