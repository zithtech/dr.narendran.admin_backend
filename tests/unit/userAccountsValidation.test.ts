import { describe, expect, it } from 'vitest';

import {
  createUserAccountSchema,
  updateUserAccountSchema,
  userAccountParamIdSchema,
  userAccountPasswordSchema,
  userAccountRoleSchema,
  userAccountUsernameSchema,
} from '../../src/modules/user_accounts/user_accounts.schema.js';

describe('User Accounts Schema Validation', () => {
  const validAccount = {
    username: 'drsmith_cardio',
    password: 'Password123!',
    role: 'DOCTOR' as const,
    status: 'ACTIVE' as const,
  };

  it('validates a completely valid user account payload', () => {
    const result = createUserAccountSchema.safeParse(validAccount);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('drsmith_cardio');
      expect(result.data.role).toBe('DOCTOR');
      expect(result.data.status).toBe('ACTIVE');
    }
  });

  describe('userAccountUsernameSchema validation', () => {
    it('accepts valid usernames with dots, hyphens, underscores, and @', () => {
      const validUsernames = [
        'john_doe',
        'admin.clinic',
        'nurse-lead',
        'reception_front_01',
        'user@clinic.org',
        'doc123',
      ];
      for (const u of validUsernames) {
        expect(userAccountUsernameSchema.safeParse(u).success, `Expected "${u}" to be valid`).toBe(true);
      }
    });

    it('rejects empty or whitespace-only username', () => {
      expect(userAccountUsernameSchema.safeParse('').success).toBe(false);
      expect(userAccountUsernameSchema.safeParse('   ').success).toBe(false);
    });

    it('rejects usernames shorter than 3 characters', () => {
      const res = userAccountUsernameSchema.safeParse('ab');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('at least 3 characters');
      }
    });

    it('rejects usernames longer than 50 characters', () => {
      const res = userAccountUsernameSchema.safeParse('a'.repeat(51));
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('cannot exceed 50 characters');
      }
    });

    it('rejects usernames with spaces', () => {
      const res = userAccountUsernameSchema.safeParse('john doe');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('cannot contain spaces');
      }
    });

    it('rejects usernames starting with a digit', () => {
      const invalid = ['123abc', '9user', '1_admin', '0doc'];
      for (const u of invalid) {
        const res = userAccountUsernameSchema.safeParse(u);
        expect(res.success, `Expected "${u}" to be rejected`).toBe(false);
        if (!res.success) {
          expect(res.error.issues[0]?.message).toContain('must start with a letter');
        }
      }
    });

    it('rejects usernames with disallowed special characters', () => {
      const invalid = ['john$doe', 'admin#1', 'user!name', 'test%clinic', 'doc^123'];
      for (const u of invalid) {
        const res = userAccountUsernameSchema.safeParse(u);
        expect(res.success, `Expected "${u}" to be rejected`).toBe(false);
      }
    });
  });

  describe('userAccountPasswordSchema validation', () => {
    it('accepts password with 6 or more characters', () => {
      expect(userAccountPasswordSchema.safeParse('123456').success).toBe(true);
      expect(userAccountPasswordSchema.safeParse('Complex@P@ssw0rd!').success).toBe(true);
    });

    it('rejects passwords shorter than 6 characters', () => {
      const res = userAccountPasswordSchema.safeParse('12345');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('at least 6 characters');
      }
    });
  });

  describe('userAccountRoleSchema validation', () => {
    it('accepts valid roles ADMIN, DOCTOR, PATIENT', () => {
      expect(userAccountRoleSchema.safeParse('ADMIN').success).toBe(true);
      expect(userAccountRoleSchema.safeParse('DOCTOR').success).toBe(true);
      expect(userAccountRoleSchema.safeParse('PATIENT').success).toBe(true);
    });

    it('rejects unauthorized roles', () => {
      expect(userAccountRoleSchema.safeParse('SUPERUSER').success).toBe(false);
      expect(userAccountRoleSchema.safeParse('NURSE').success).toBe(false);
    });
  });

  describe('updateUserAccountSchema validation', () => {
    it('allows updating without providing a new password (null, empty, or undefined)', () => {
      const updateWithoutPassword = {
        username: 'drsmith_updated',
        role: 'DOCTOR' as const,
        status: 'ACTIVE' as const,
      };
      expect(updateUserAccountSchema.safeParse(updateWithoutPassword).success).toBe(true);
      expect(
        updateUserAccountSchema.safeParse({ ...updateWithoutPassword, password: '' }).success,
      ).toBe(true);
      expect(
        updateUserAccountSchema.safeParse({ ...updateWithoutPassword, password: null }).success,
      ).toBe(true);
    });

    it('validates new password if provided on update', () => {
      const updateWithShortPassword = {
        username: 'drsmith_updated',
        password: '123',
        role: 'DOCTOR' as const,
      };
      expect(updateUserAccountSchema.safeParse(updateWithShortPassword).success).toBe(false);
    });
  });

  describe('userAccountParamIdSchema validation', () => {
    it('accepts valid UUID parameter', () => {
      expect(
        userAccountParamIdSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success,
      ).toBe(true);
    });

    it('rejects non-UUID parameter', () => {
      expect(userAccountParamIdSchema.safeParse({ id: 'invalid-id' }).success).toBe(false);
    });
  });
});

