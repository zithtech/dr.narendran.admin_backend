import jwt from 'jsonwebtoken';
import {describe, expect, it} from 'vitest';

import {env} from '@/config/env.js';
import {UnauthorizedError} from '@/http/errors.js';
import {signAccessToken, verifyAccessToken} from '@/modules/auth/tokens.js';

const payload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'alice@example.com',
  role: 'patient' as const,
  tokenVersion: 0,
};

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a payload', () => {
    expect(verifyAccessToken(signAccessToken(payload))).toEqual(payload);
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign(
      {email: payload.email, role: 'admin', tv: 0},
      'a'.repeat(40),
      {
        subject: payload.sub,
        issuer: 'drnarendran-api',
      },
    );

    expect(() => verifyAccessToken(forged)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      {email: payload.email, role: payload.role, tv: 0},
      env.JWT_SECRET,
      {subject: payload.sub, issuer: 'drnarendran-api', expiresIn: '-1s'},
    );

    expect(() => verifyAccessToken(expired)).toThrow(UnauthorizedError);
  });

  it('rejects a token from an unexpected issuer', () => {
    const wrongIssuer = jwt.sign(
      {email: payload.email, role: payload.role, tv: 0},
      env.JWT_SECRET,
      {subject: payload.sub, issuer: 'somebody-else'},
    );

    expect(() => verifyAccessToken(wrongIssuer)).toThrow(UnauthorizedError);
  });

  it('rejects the alg:none confusion attack', () => {
    /* A token asking to be verified with no signature at all. Pinning
       `algorithms: ['HS256']` in verifyAccessToken is what stops this; without
       it, jsonwebtoken would honour the token's own `alg` header. */
    const unsigned = `${Buffer.from(
      JSON.stringify({alg: 'none', typ: 'JWT'}),
    ).toString('base64url')}.${Buffer.from(
      JSON.stringify({
        sub: payload.sub,
        email: payload.email,
        role: 'admin',
        tv: 0,
        iss: 'drnarendran-api',
      }),
    ).toString('base64url')}.`;

    expect(() => verifyAccessToken(unsigned)).toThrow(UnauthorizedError);
  });

  it('rejects a token carrying an unknown role', () => {
    const badRole = jwt.sign(
      {email: payload.email, role: 'superuser', tv: 0},
      env.JWT_SECRET,
      {subject: payload.sub, issuer: 'drnarendran-api'},
    );

    expect(() => verifyAccessToken(badRole)).toThrow(UnauthorizedError);
  });

  it('rejects a token with no token_version claim', () => {
    /* Tokens issued before revocation existed must not be silently accepted. */
    const legacy = jwt.sign(
      {email: payload.email, role: payload.role},
      env.JWT_SECRET,
      {subject: payload.sub, issuer: 'drnarendran-api'},
    );

    expect(() => verifyAccessToken(legacy)).toThrow(UnauthorizedError);
  });

  it('rejects arbitrary garbage', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow(UnauthorizedError);
    expect(() => verifyAccessToken('')).toThrow(UnauthorizedError);
  });
});
