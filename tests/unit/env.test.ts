import {afterEach, describe, expect, it, vi} from 'vitest';

/* `import type` is fully erased at compile time, so this gives the helper a
   real return type without statically importing the module - which matters,
   because each test needs a FRESH evaluation of it after vi.resetModules(). */
import type * as EnvModule from '@/config/env.js';

/**
 * Env validation must fail at IMPORT time, not on first use. These tests
 * re-import the module with a mutated process.env to prove that.
 *
 * Note they set INVALID values rather than deleting variables: env.ts calls
 * dotenv, and dotenv would repopulate anything deleted here from the real
 * .env file, so a deletion would not actually test the missing-value path.
 */
async function loadEnvWith(
  overrides: Record<string, string>,
): Promise<typeof EnvModule> {
  vi.resetModules();
  const saved = {...process.env};
  Object.assign(process.env, overrides);
  try {
    return await import('@/config/env.js');
  } finally {
    process.env = saved;
  }
}

afterEach(() => {
  vi.resetModules();
});

describe('env validation', () => {
  it('loads successfully with the test configuration', async () => {
    const {env} = await loadEnvWith({});
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4000);
  });

  it('throws on a JWT_SECRET shorter than 32 characters', async () => {
    await expect(loadEnvWith({JWT_SECRET: 'too-short'})).rejects.toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
  });

  it('throws on a non-numeric PORT', async () => {
    await expect(loadEnvWith({PORT: 'not-a-number'})).rejects.toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws on a DATABASE_URL that is not a postgres connection string', async () => {
    await expect(
      loadEnvWith({DATABASE_URL: 'mysql://user:pw@host/db'}),
    ).rejects.toThrow(/postgresql:\/\//);
  });

  it('lists every problem at once rather than failing on the first', async () => {
    await expect(
      loadEnvWith({JWT_SECRET: 'short', PORT: 'nope'}),
    ).rejects.toThrow(/JWT_SECRET[\s\S]*PORT|PORT[\s\S]*JWT_SECRET/);
  });

  it('refuses to run tests against the dev database', async () => {
    const shared = 'postgresql://u:p@127.0.0.1:5432/same_database';

    /* The single guard standing between the suite's TRUNCATE statements and
       real development data. */
    await expect(
      loadEnvWith({
        NODE_ENV: 'test',
        DATABASE_URL: shared,
        TEST_DATABASE_URL: shared,
      }),
    ).rejects.toThrow(/Refusing to run destructive tests/);
  });

  it('parses CORS_ORIGINS into a trimmed list', async () => {
    const {env} = await loadEnvWith({
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com ,',
    });

    expect(env.CORS_ORIGIN_LIST).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('treats an empty CORS_ORIGINS as "allow no browser origin"', async () => {
    const {env} = await loadEnvWith({CORS_ORIGINS: ''});
    expect(env.CORS_ORIGIN_LIST).toEqual([]);
  });

  it('coerces DB_SSL from its string form', async () => {
    const {env} = await loadEnvWith({DB_SSL: 'true'});
    expect(env.DB_SSL).toBe(true);
  });

  it('parses RATE_LIMIT_MAX and SKIP_RATE_LIMIT options', async () => {
    const {env} = await loadEnvWith({
      RATE_LIMIT_MAX: '500',
      SKIP_RATE_LIMIT: 'true',
    });
    expect(env.RATE_LIMIT_MAX).toBe(500);
    expect(env.SKIP_RATE_LIMIT).toBe(true);
  });
});
