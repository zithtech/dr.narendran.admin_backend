import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * This module validates `process.env` at IMPORT time and throws if anything is
 * missing or malformed. That is deliberate: the alternative is an app that
 * boots "successfully" and then fails at 3am on the first request that touches
 * an `undefined` config value. Fail loudly at startup instead.
 *
 * This is the ONLY module in the codebase permitted to read `process.env`.
 * Everything else imports `env` from here and gets fully-typed values.
 */

loadDotenv();

/** `.env` files only hold strings, so booleans arrive as "true" / "false". */
const booleanFromEnv = z
  .enum(['true', 'false'])
  .transform(value => value === 'true');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().max(65_535).default(5000),

  ENABLE_SCHEDULERS: booleanFromEnv.default(false),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .startsWith('postgres', 'must be a postgresql:// connection string'),

  /* Only required when NODE_ENV=test; see the refinement below. */
  TEST_DATABASE_URL: z.string().min(1).optional(),

  /* `.default()` sits after `.transform()`, so it supplies the OUTPUT value
     (a boolean) for a missing variable, not the raw "true"/"false" string. */
  DB_SSL: booleanFromEnv.default(false),
  DB_SSL_REJECT_UNAUTHORIZED: booleanFromEnv.default(true),
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  /* 32 chars is the floor for an HMAC-SHA256 signing key. A short secret is
     the quiet way JWT auth becomes forgeable, so it is enforced, not advised. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),

  /* 'silent' is a real pino level and the only sane setting for a test run,
     where log output is noise that buries the assertion failures. */
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  /* Comma-separated allowlist. Empty string means "no browser origin is
     allowed", which is the correct default for an API whose only clients are
     native apps. */
  CORS_ORIGINS: z.string().default(''),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  SKIP_RATE_LIMIT: booleanFromEnv.default(false),

  /* AWS S3 Configuration */
  AWS_REGION: z.string().default('eu-north-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_NAME: z
    .string()
    .default('zithtech-s3-bucket-431451850777-eu-north-1-an'),

  SYSTEM_EMAIL: z.string().email().default('system@example.com'),
  SYSTEM_APP_PASSWORD: z.string().default('change_me'),
  SYSTEM_HOST: z.string().default('smtp.example.com'),
  SYSTEM_PORT: z.coerce.number().int().positive().default(465),
  SYSTEM_SECURE: booleanFromEnv.default(true),
  GEMINI_API_KEY: z.string().default(""),

  /* Firebase Admin Configuration */
  FIREBASE_PROJECT_ID: z.string().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().default(''),
  FIREBASE_PRIVATE_KEY: z.string().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map(issue => {
      const key = issue.path.join('.') || '(root)';
      return `  - ${key}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(
    `Invalid environment configuration:\n${details}\n\n` +
    'Copy .env.example to .env and fill in the missing values.',
  );
}

const raw = parsed.data;

/**
 * The connection string actually used by the pool.
 *
 * Under NODE_ENV=test this resolves to TEST_DATABASE_URL, because the suite
 * TRUNCATEs tables between tests. Pointing it at the dev database would wipe
 * real data, so the two guards below are load-bearing, not defensive noise.
 */
function resolveDatabaseUrl(): string {
  if (raw.NODE_ENV !== 'test') {
    return raw.DATABASE_URL;
  }

  if (!raw.TEST_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must be set when NODE_ENV=test. The test suite ' +
      'truncates tables, so it must never point at the dev database.',
    );
  }

  if (raw.TEST_DATABASE_URL === raw.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL is identical to DATABASE_URL. Refusing to run ' +
      'destructive tests against the development database.',
    );
  }

  return raw.TEST_DATABASE_URL;
}

export const env = Object.freeze({
  ...raw,
  DATABASE_URL_ACTIVE: resolveDatabaseUrl(),
  IS_PRODUCTION: raw.NODE_ENV === 'production',
  IS_TEST: raw.NODE_ENV === 'test',
  IS_DEVELOPMENT: raw.NODE_ENV === 'development',
  /* Parsed once here rather than re-split on every CORS preflight. */
  CORS_ORIGIN_LIST: raw.CORS_ORIGINS.split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0),
});

export type Env = typeof env;
