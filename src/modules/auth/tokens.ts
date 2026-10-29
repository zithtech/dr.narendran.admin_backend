import jwt from 'jsonwebtoken';

import { env } from '@/config/env.js';
import { UnauthorizedError } from '@/http/errors.js';
import { USER_ROLES, type UserRole } from '@/modules/users/users.types.js';

/**
 * Access token signing and verification.
 *
 * Deliberately the only module that touches `jsonwebtoken`, so the token
 * format can change (opaque tokens, asymmetric keys, a refresh flow) without
 * that leaking into services or middleware.
 */

const ISSUER = 'drnarendran-api';

export interface AccessTokenPayload {
  /** User id. `sub` is the registered JWT claim for subject. */
  sub: string;
  email: string;
  role: UserRole;
  /**
   * The user's `token_version` at signing time. `requireAuth` compares this
   * against the current stored value and rejects the token if it has moved on,
   * which is what makes revocation possible for an otherwise stateless JWT.
   */
  tokenVersion: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { email: payload.email, role: payload.role, tv: payload.tokenVersion },
    env.JWT_SECRET,
    {
      subject: payload.sub,
      issuer: ISSUER,
      /* @types/jsonwebtoken types this as a template-literal `ms` string
         (e.g. "7d"). The env value is a validated non-empty string, so the
         cast narrows `string` to that union rather than asserting anything.
         NonNullable is needed because exactOptionalPropertyTypes makes the
         bare property type include `undefined`, which the overload rejects. */
      expiresIn: env.JWT_EXPIRES_IN as NonNullable<
        jwt.SignOptions['expiresIn']
      >,
      algorithm: 'HS256',
    },
  );
}

/**
 * Verifies a token and returns its payload.
 *
 * EVERY failure mode throws `UnauthorizedError` (401) - expired, tampered,
 * wrong issuer, malformed, wrong algorithm. The mobile apps treat 401 as
 * "session dead, log out" and have no recovery path for a 403, so returning
 * anything else here would strand the app holding a token it can never use.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: ISSUER,
      /* Pinning the algorithm is what prevents the classic `alg: "none"` and
         RS256->HS256 confusion attacks. Without it, the token itself gets to
         choose how it is verified. */
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Your session has expired.', { cause: error });
    }
    throw new UnauthorizedError('Invalid authentication token.', {
      cause: error,
    });
  }

  /* jwt.verify returns `string | JwtPayload`; validate the shape rather than
     trusting it, since a token signed with an older payload format would
     otherwise produce `undefined` fields downstream. */
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as jwt.JwtPayload).sub !== 'string'
  ) {
    throw new UnauthorizedError('Invalid authentication token.');
  }

  const payload = decoded as jwt.JwtPayload & {
    email?: unknown;
    role?: unknown;
    tv?: unknown;
  };

  if (
    typeof payload.email !== 'string' ||
    typeof payload.role !== 'string' ||
    !(USER_ROLES as readonly string[]).includes(payload.role) ||
    typeof payload.tv !== 'number'
  ) {
    throw new UnauthorizedError('Invalid authentication token.');
  }

  return {
    sub: payload.sub!,
    email: payload.email,
    role: payload.role as UserRole,
    tokenVersion: payload.tv,
  };
}
