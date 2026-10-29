import {describe, expect, it} from 'vitest';

import {mapDatabaseError} from '@/db/errors.js';
import {
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from '@/http/errors.js';

/** Builds an object shaped like a `pg` driver error. */
function pgError(code: string, constraint?: string): Error {
  const error = new Error(`postgres error ${code}`) as Error & {
    code: string;
    constraint?: string;
  };
  error.code = code;
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

describe('mapDatabaseError', () => {
  it('maps a unique violation to 409 Conflict', () => {
    const mapped = mapDatabaseError(pgError('23505'));
    expect(mapped).toBeInstanceOf(ConflictError);
  });

  it('uses the caller-supplied message for a known constraint', () => {
    const mapped = mapDatabaseError(pgError('23505', 'users_email_lower_key'), {
      users_email_lower_key: 'That email address is already registered.',
    });

    expect(mapped.message).toBe('That email address is already registered.');
  });

  it.each([
    ['foreign key violation', '23503'],
    ['not null violation', '23502'],
    ['check violation', '23514'],
    ['invalid text representation', '22P02'],
  ])('maps %s to 400 Validation', (_label, code) => {
    expect(mapDatabaseError(pgError(code))).toBeInstanceOf(ValidationError);
  });

  it.each([
    ['statement timeout', '57014'],
    ['admin shutdown', '57P01'],
    ['too many connections', '53300'],
  ])('maps %s to 503 Service Unavailable', (_label, code) => {
    expect(mapDatabaseError(pgError(code))).toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('passes an unmapped SQLSTATE through unchanged so it becomes a logged 500', () => {
    const original = pgError('XX000');
    expect(mapDatabaseError(original)).toBe(original);
  });

  it('passes a non-database error through unchanged', () => {
    const original = new Error('something else entirely');
    expect(mapDatabaseError(original)).toBe(original);
  });

  it('never leaks the raw Postgres message for a mapped error', () => {
    const mapped = mapDatabaseError(pgError('23505'));
    expect(mapped.message).not.toContain('postgres error');
  });
});
