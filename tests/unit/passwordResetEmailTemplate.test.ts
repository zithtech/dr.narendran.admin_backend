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
    expect(html).toContain('Advanced Oncology, Cardiology & Multi-Specialty Clinical Platform');
    expect(html).toContain(String(new Date().getFullYear()));
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
