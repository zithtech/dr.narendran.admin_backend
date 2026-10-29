import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/modules/users/users.repository.js');

import {buildApp} from '@/http/app.js';
import {ConflictError} from '@/http/errors.js';
import * as usersRepository from '@/modules/users/users.repository.js';

import {
  ADMIN_ID,
  ALICE_ID,
  bearer,
  BOB_ID,
  makeAuthContext,
  makeUser,
  tokenFor,
} from '../helpers/fixtures.js';

const app = buildApp();

/** Authenticates every request in a test as Alice, an ordinary patient. */
function authAsAlice(): void {
  vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
    makeAuthContext({id: ALICE_ID, role: 'patient'}),
  );
}

function authAsAdmin(): void {
  vi.mocked(usersRepository.findAuthContextById).mockResolvedValue(
    makeAuthContext({id: ADMIN_ID, role: 'admin', email: 'admin@example.com'}),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/users (registration)', () => {
  it('creates a user and returns 201 with a Location header', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(makeUser());

    const res = await request(app).post('/api/users').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
    });

    expect(res.status).toBe(201);
    expect(res.headers['location']).toBe(`/api/users/${ALICE_ID}`);
    expect(res.body.user.id).toBe(ALICE_ID);
  });

  it('never returns the password hash', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(makeUser());

    const res = await request(app).post('/api/users').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
    });

    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/i);
  });

  it('always creates a patient, whatever the client asks for', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(makeUser());

    const res = await request(app).post('/api/users').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
      role: 'admin',
    });

    /* Privilege escalation via the registration payload. A Zod `.default()`
       would NOT catch this, because a default only applies to a MISSING key -
       hence strictObject plus a hardcoded role in the service. */
    expect(res.status).toBe(400);
    expect(res.body.details.issues[0].message).toMatch(/unrecognized key/i);
    expect(usersRepository.create).not.toHaveBeenCalled();
  });

  it('hashes the password with argon2id rather than storing it', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(makeUser());

    await request(app).post('/api/users').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
    });

    const arg = vi.mocked(usersRepository.create).mock.calls[0]?.[0];
    expect(arg?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(arg?.passwordHash).not.toContain('correct-horse-battery');
    expect(arg?.role).toBe('patient');
  });

  it('normalises the email to lowercase', async () => {
    vi.mocked(usersRepository.create).mockResolvedValue(makeUser());

    await request(app).post('/api/users').send({
      email: '  ALICE@Example.COM ',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
    });

    expect(vi.mocked(usersRepository.create).mock.calls[0]?.[0].email).toBe(
      'alice@example.com',
    );
  });

  it.each([
    [
      'invalid email',
      {email: 'nope', password: 'correct-horse-battery', fullName: 'A'},
    ],
    ['short password', {email: 'a@b.com', password: 'short', fullName: 'A'}],
    [
      'blank name',
      {email: 'a@b.com', password: 'correct-horse-battery', fullName: '   '},
    ],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app).post('/api/users').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('maps a duplicate email to 409', async () => {
    vi.mocked(usersRepository.create).mockRejectedValue(
      new ConflictError('That email address is already registered.'),
    );

    const res = await request(app).post('/api/users').send({
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      fullName: 'Alice Tan',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });
});

describe('GET /api/users', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns users with pagination metadata', async () => {
    authAsAlice();
    vi.mocked(usersRepository.list).mockResolvedValue([makeUser()]);
    vi.mocked(usersRepository.count).mockResolvedValue(1);

    const res = await request(app)
      .get('/api/users')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.pagination).toEqual({total: 1, limit: 20, offset: 0});
  });

  it('caps limit at 100 to prevent unbounded reads', async () => {
    authAsAlice();

    const res = await request(app)
      .get('/api/users?limit=100000')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(400);
  });

  it('passes a role filter through to the repository', async () => {
    authAsAlice();
    vi.mocked(usersRepository.list).mockResolvedValue([]);
    vi.mocked(usersRepository.count).mockResolvedValue(0);

    await request(app)
      .get('/api/users?role=doctor&limit=5&offset=10')
      .set(...bearer(tokenFor()));

    expect(usersRepository.list).toHaveBeenCalledWith({
      role: 'doctor',
      limit: 5,
      offset: 10,
    });
  });
});

describe('GET /api/users/:id', () => {
  it('400s on a non-uuid id before touching the database', async () => {
    authAsAlice();

    const res = await request(app)
      .get('/api/users/not-a-uuid')
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(400);
    expect(usersRepository.findById).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    authAsAlice();
    vi.mocked(usersRepository.findById).mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/users/${BOB_ID}`)
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/users/:id', () => {
  it('lets a user edit their own name', async () => {
    authAsAlice();
    vi.mocked(usersRepository.update).mockResolvedValue(
      makeUser({fullName: 'Alice Tan-Rahman'}),
    );

    const res = await request(app)
      .patch(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor()))
      .send({fullName: 'Alice Tan-Rahman'});

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Alice Tan-Rahman');
  });

  it('403s when editing someone else', async () => {
    authAsAlice();

    const res = await request(app)
      .patch(`/api/users/${BOB_ID}`)
      .set(...bearer(tokenFor()))
      .send({fullName: 'Not mine'});

    expect(res.status).toBe(403);
    expect(usersRepository.update).not.toHaveBeenCalled();
  });

  it('403s when a non-admin tries to change their own role', async () => {
    authAsAlice();

    const res = await request(app)
      .patch(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor()))
      .send({role: 'admin'});

    /* Route guards can only say "may you touch this record"; only the service
       can say "may you change THIS FIELD". This is the escalation path that
       self-service profile editing would otherwise open. */
    expect(res.status).toBe(403);
    expect(usersRepository.update).not.toHaveBeenCalled();
  });

  it('allows an admin to change a role', async () => {
    authAsAdmin();
    vi.mocked(usersRepository.update).mockResolvedValue(
      makeUser({role: 'doctor'}),
    );

    const res = await request(app)
      .patch(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor({id: ADMIN_ID, role: 'admin'})))
      .send({role: 'doctor'});

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('doctor');
  });

  it('400s on an empty patch body', async () => {
    authAsAlice();

    const res = await request(app)
      .patch(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor()))
      .send({});

    expect(res.status).toBe(400);
  });

  it('404s when the user does not exist', async () => {
    authAsAdmin();
    vi.mocked(usersRepository.update).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/users/${BOB_ID}`)
      .set(...bearer(tokenFor({id: ADMIN_ID, role: 'admin'})))
      .send({fullName: 'Ghost'});

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/:id', () => {
  it('soft-deletes and returns 204', async () => {
    authAsAlice();
    vi.mocked(usersRepository.softDelete).mockResolvedValue(true);

    const res = await request(app)
      .delete(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(204);
    expect(usersRepository.softDelete).toHaveBeenCalledWith(ALICE_ID);
  });

  it('404s when already deleted', async () => {
    authAsAlice();
    vi.mocked(usersRepository.softDelete).mockResolvedValue(false);

    const res = await request(app)
      .delete(`/api/users/${ALICE_ID}`)
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(404);
  });

  it('403s when deleting someone else', async () => {
    authAsAlice();

    const res = await request(app)
      .delete(`/api/users/${BOB_ID}`)
      .set(...bearer(tokenFor()));

    expect(res.status).toBe(403);
    expect(usersRepository.softDelete).not.toHaveBeenCalled();
  });
});
