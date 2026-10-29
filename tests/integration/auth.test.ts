import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Hoisted above the imports by Vitest. Mocking the repository is what lets the
   whole HTTP stack run for real without a database - only the SQL layer is
   replaced. */
vi.mock('@/modules/users/users.repository.js');

import { buildApp } from '@/http/app.js';
import * as usersRepository from '@/modules/users/users.repository.js';

import {
  ALICE_ID,
  bearer,
  makeAuthContext,
  makeUserWithPassword,
  tokenFor,
} from '../helpers/fixtures.js';

const app = buildApp();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/auth/login', () => {
  it('returns exactly {token} on valid credentials', async () => {
    vi.mocked(usersRepository.findByEmailWithPassword).mockResolvedValue(
      makeUserWithPassword(),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'correct-horse-battery' });

    expect(res.status).toBe(200);
    /* The apps' authApi.ts rejects any response whose `token` is not a
       non-empty string, and ignores everything else. Assert the exact shape so
       an extra wrapper key cannot creep in unnoticed. */
    expect(Object.keys(res.body)).toEqual(['token']);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it('lowercases the email before looking it up', async () => {
    vi.mocked(usersRepository.findByEmailWithPassword).mockResolvedValue(
      makeUserWithPassword(),
    );

    await request(app).post('/api/auth/login').send({
      email: '  ALICE@Example.COM  ',
      password: 'correct-horse-battery',
    });

    expect(usersRepository.findByEmailWithPassword).toHaveBeenCalledWith(
      'alice@example.com',
    );
  });

  it('returns 401 with the apps expected body on a wrong password', async () => {
    vi.mocked(usersRepository.findByEmailWithPassword).mockResolvedValue(
      makeUserWithPassword(),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('gives an identical response for an unknown email', async () => {
    vi.mocked(usersRepository.findByEmailWithPassword).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-password' });

    /* Same status AND same message as the wrong-password case: any difference
       here is an account-enumeration oracle. */
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects a missing password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the caller identity for a valid token', async () => {
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
      makeAuthContext(),
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: ALICE_ID,
      email: 'alice@example.com',
      role: 'patient',
    });
  });

  it('401s when the Authorization header is absent', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it.each([
    ['malformed token', 'Bearer not.a.jwt'],
    ['wrong scheme', 'Basic abcdef'],
    ['empty bearer', 'Bearer '],
  ])('401s on %s', async (_label, header) => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', header);

    /* Every auth failure must be 401, never 403 - the apps clear the session
       on 401 and have no recovery path for a 403. */
    expect(res.status).toBe(401);
  });

  it('401s when the token was signed with a stale token_version', async () => {
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
      makeAuthContext({ tokenVersion: 3 }),
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set(...bearer(tokenFor({ tokenVersion: 2 })));

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revoked/i);
  });

  it('401s when the account no longer exists', async () => {
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/auth/me')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(401);
  });

  it('reads role from the database, not from the token', async () => {
    /* A token minted while the user was an admin must not keep admin rights
       after a demotion. */
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
      makeAuthContext({ role: 'patient' }),
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set(...bearer(tokenFor({ role: 'admin' })));

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('patient');
  });
});

describe('POST /api/auth/logout-all', () => {
  it('bumps the token version and returns 204', async () => {
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
      makeAuthContext(),
    );
    vi.mocked(usersRepository.incrementTokenVersion).mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(204);
    expect(usersRepository.incrementTokenVersion).toHaveBeenCalledWith(
      ALICE_ID,
    );
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/otp/send & /api/auth/send-otp', () => {
  it('returns success for valid mobile number', async () => {
    const res = await request(app)
      .post('/api/auth/otp/send')
      .send({ phone: '+91 9876543210' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.phone).toBe('+91 9876543210');
    expect(res.body.expiresInSeconds).toBe(300);
  });

  it('400s if phone is missing or empty', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({ phone: '' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/otp/verify & /api/auth/verify-otp', () => {
  it('verifies code 123456 and returns session token for existing patient user', async () => {
    vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
      makeAuthContext(),
    );

    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+91 9876543210', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns isNewUser: true and verificationToken for unrecognised phone number', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+91 9999999999', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isNewUser).toBe(true);
    expect(typeof res.body.verificationToken).toBe('string');
  });

  it('401s on invalid OTP codes (000000 or 999999 or wrong code)', async () => {
    const res1 = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+91 9876543210', code: '000000' });
    expect(res1.status).toBe(401);
    expect(res1.body.error).toMatch(/incorrect verification code/i);

    const res2 = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+91 9876543210', code: '888888' });
    expect(res2.status).toBe(401);
    expect(res2.body.error).toMatch(/incorrect verification code/i);
  });

  it('400s on missing code parameter', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+91 9876543210' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/register', () => {
  it('registers a new patient profile and returns token + user payload', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        phone: '+91 9876543210',
        verificationToken: 'vtoken_123',
        profile: {
          fullName: 'Kavitha Ramesh',
          dob: '1995-05-20',
          gender: 'Female',
          email: 'kavitha@example.com',
        },
        consents: {
          records: true,
          reminders: true,
          education: false,
        },
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({
      phone: '+91 9876543210',
      fullName: 'Kavitha Ramesh',
      email: 'kavitha@example.com',
      role: 'patient',
    });
  });

  it('400s when required consent (records) is missing or false', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        phone: '+91 9876543210',
        profile: {
          fullName: 'Kavitha Ramesh',
        },
        consents: {
          records: false,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('400s when fullName is missing from profile', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        phone: '+91 9876543210',
        profile: {
          fullName: '',
        },
        consents: {
          records: true,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
