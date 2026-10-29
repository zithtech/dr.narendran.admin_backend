import {signAccessToken} from '@/modules/auth/tokens.js';
import type {
  User,
  UserAuthContext,
  UserRole,
  UserWithPassword,
} from '@/modules/users/users.types.js';

/**
 * Test fixtures.
 *
 * Deliberately plain factory functions rather than a fixture framework: a test
 * that fails should be debuggable by reading it top to bottom.
 */

export const ALICE_ID = '11111111-1111-4111-8111-111111111111';
export const BOB_ID = '22222222-2222-4222-8222-222222222222';
export const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: ALICE_ID,
    email: 'alice@example.com',
    fullName: 'Alice Tan',
    role: 'patient',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeAuthContext(
  overrides: Partial<UserAuthContext> = {},
): UserAuthContext {
  return {
    id: ALICE_ID,
    email: 'alice@example.com',
    role: 'patient',
    tokenVersion: 0,
    ...overrides,
  };
}

export function makeUserWithPassword(
  overrides: Partial<UserWithPassword> = {},
): UserWithPassword {
  return {
    ...makeUser(),
    /* argon2id hash of 'correct-horse-battery', generated with the same
       parameters as users.service.ts. Hardcoded rather than hashed at test
       time so the suite does not pay ~60ms per test for a known value. */
    passwordHash:
      '$argon2id$v=19$m=19456,p=1,t=2$G0fKglXBePv4HAvtkxqHxw$7Ny3Qt3eUgCkc/ywAFa1sh8R9sJeDxT4NU92IYUk5Os',
    tokenVersion: 0,
    ...overrides,
  };
}

/** Builds a valid bearer token for a user. */
export function tokenFor(
  opts: {
    id?: string;
    email?: string;
    role?: UserRole;
    tokenVersion?: number;
  } = {},
): string {
  return signAccessToken({
    sub: opts.id ?? ALICE_ID,
    email: opts.email ?? 'alice@example.com',
    role: opts.role ?? 'patient',
    tokenVersion: opts.tokenVersion ?? 0,
  });
}

export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
