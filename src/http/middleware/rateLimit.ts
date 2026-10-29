import {rateLimit} from 'express-rate-limit';

import {env} from '@/config/env.js';
import {TooManyRequestsError} from '@/http/errors.js';

/**
 * Rate limiting.
 *
 * Both limiters use the default in-memory store, which counts PER PROCESS.
 * That is correct for a single instance and deliberately not over-engineered
 * for scale we do not have yet - but it is the first thing to change when a
 * second instance appears, since N instances currently means N x the limit.
 * Swap in `rate-limit-redis` at that point; nothing else needs to change.
 *
 * Both funnel through `TooManyRequestsError` so a 429 comes back in the same
 * `{error, code}` envelope as every other error, instead of the plain-text
 * body the library sends by default.
 */

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Broad protection against runaway clients and casual scraping. */
export const apiRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: env.RATE_LIMIT_MAX,
  skip: () => env.IS_DEVELOPMENT || env.IS_TEST || env.SKIP_RATE_LIMIT,
  /* RateLimit-* headers per the IETF draft; the legacy X-RateLimit-* set is
     off to avoid sending both. */
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new TooManyRequestsError());
  },
});

/**
 * Much tighter limit on login, which is the brute-force target.
 *
 * `skipSuccessfulRequests` means only FAILED attempts count, so a legitimate
 * user who logs in repeatedly is never locked out, while someone guessing
 * passwords gets 10 tries per 15 minutes.
 *
 * Note this is keyed by IP, not by email: keying on email would let an
 * attacker lock a known user out of their own account by deliberately failing.
 */
export const loginRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  skip: () => env.IS_DEVELOPMENT || env.IS_TEST || env.SKIP_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new TooManyRequestsError(
        'Too many login attempts. Please wait a few minutes and try again.',
      ),
    );
  },
});
