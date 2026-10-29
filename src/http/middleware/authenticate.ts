import type {Request, RequestHandler} from 'express';

import {ForbiddenError, UnauthorizedError} from '@/http/errors.js';
import {verifyAccessToken} from '@/modules/auth/tokens.js';
import * as usersRepository from '@/modules/users/users.repository.js';
import type {UserRole} from '@/modules/users/users.types.js';

/**
 * Authentication and authorization guards.
 *
 * The 401/403 split matters to the clients: a 401 makes both apps clear the
 * Keychain and bounce to Login, a 403 shows "you do not have permission" and
 * keeps the session. Use 401 only for "we do not know who you are", 403 for
 * "we know, and you may not".
 */

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  const queryToken = req.query['token'];

  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  if (typeof header !== 'string' || header.length === 0) {
    throw new UnauthorizedError('Authentication required.');
  }

  const [scheme, token] = header.split(' ');

  if (
    scheme?.toLowerCase() !== 'bearer' ||
    token === undefined ||
    token === ''
  ) {
    throw new UnauthorizedError('Invalid authorization header.');
  }

  return token;
}

/**
 * Requires a valid, non-revoked access token. Populates `req.user`.
 *
 * Two checks, in order:
 *  1. The signature/expiry/issuer are valid (pure crypto, no I/O).
 *  2. The token has not been revoked, and the account still exists.
 *
 * Step 2 is a primary-key lookup on every authenticated request. That is the
 * deliberate cost of revocable tokens: without it a leaked token stays valid
 * for its full 7-day lifetime and deleting an account leaves its sessions
 * working. Role and email are re-read from the database rather than trusted
 * from the token, so a demotion takes effect immediately instead of at the
 * next login.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const payload = verifyAccessToken(extractBearerToken(req));

      const current = await usersRepository.findAuthContextById(payload.sub);

      /* Deleted (or never existed) - 401 so the app clears its stored token
         rather than retrying forever with a token for a dead account. */
      if (current === null) {
        throw new UnauthorizedError('Your session is no longer valid.');
      }

      if (current.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedError(
          'Your session has been revoked. Please log in again.',
        );
      }

      req.user = {
        id: current.id,
        email: current.email,
        role: current.role,
      };
      next();
    } catch (error) {
      next(error);
    }
  })();
};

/**
 * Requires one of `roles`. Must be mounted AFTER `requireAuth`.
 *
 * The missing-`req.user` case is a 401 rather than a 403 because it can only
 * mean the route was wired without `requireAuth` - treating it as "forbidden"
 * would hide a routing bug behind a plausible-looking response.
 */
export function requireRole(...roles: readonly UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required.'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}

/**
 * Allows the acting user to operate on their own record, or any of `roles`
 * to operate on anyone's. Used by PATCH/DELETE /users/:id, where a user may
 * edit themselves but only an admin may edit others.
 *
 * `paramName` is read from `req.params` (the raw value) rather than
 * `req.validated`, so the guard works regardless of middleware ordering.
 */
export function requireSelfOrRole(
  paramName: string,
  ...roles: readonly UserRole[]
): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required.'));
      return;
    }

    if (roles.includes(req.user.role)) {
      next();
      return;
    }

    if (req.params[paramName] === req.user.id) {
      next();
      return;
    }

    next(new ForbiddenError());
  };
}
