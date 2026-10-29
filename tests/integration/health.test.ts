import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/db/pool.js');

import {checkDatabaseConnection, getPoolStats} from '@/db/pool.js';
import {buildApp} from '@/http/app.js';

const app = buildApp();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/health', () => {
  it('reports 200 / db up when the database answers', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValue(true);
    vi.mocked(getPoolStats).mockReturnValue({total: 2, idle: 1, waiting: 0});

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'ok', db: 'up'});
  });

  it('exposes pool occupancy so a connection bottleneck is diagnosable', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValue(true);
    vi.mocked(getPoolStats).mockReturnValue({total: 10, idle: 0, waiting: 7});

    const res = await request(app).get('/api/health');

    /* waiting > 0 means requests are queueing for a connection - the signal
       that DB_POOL_MAX is the bottleneck rather than the database itself. */
    expect(res.body.pool).toEqual({total: 10, idle: 0, waiting: 7});
  });

  it('reports 503 / db down when the database is unreachable', async () => {
    vi.mocked(checkDatabaseConnection).mockRejectedValue(
      new Error('connection refused'),
    );

    const res = await request(app).get('/api/health');

    /* The whole point of the endpoint: a load balancer must be able to pull
       this instance out of rotation. Returning 200 here would be worse than
       having no health check at all. */
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({status: 'degraded', db: 'down'});
  });
});

describe('GET /api/health/live', () => {
  it('returns 200 without touching the database', async () => {
    vi.mocked(checkDatabaseConnection).mockRejectedValue(
      new Error('connection refused'),
    );

    const res = await request(app).get('/api/health/live');

    /* Liveness must stay green during a database outage - otherwise the
       orchestrator restarts every healthy instance and turns a recoverable
       outage into a restart storm. */
    expect(res.status).toBe(200);
    expect(checkDatabaseConnection).not.toHaveBeenCalled();
  });
});

describe('error envelope', () => {
  it('returns unknown routes as 404 in the {error} shape the apps expect', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.code).toBe('NOT_FOUND');
    expect(typeof res.body.requestId).toBe('string');
  });

  it('echoes an inbound x-request-id for log correlation', async () => {
    const res = await request(app)
      .get('/api/health/live')
      .set('x-request-id', 'trace-me-123');

    expect(res.headers['x-request-id']).toBe('trace-me-123');
  });

  it('generates a request id when none is supplied', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not advertise the server technology', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets helmet security headers', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects an oversized JSON body with 413, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({email: 'a@b.com', password: 'x'.repeat(200_000)}));

    /* express.json's 100kb cap fires before any handler runs, and body-parser
       throws an http-errors object rather than an AppError. Without explicit
       handling that becomes a 500 - a client bug masquerading as a server
       fault, which is exactly the kind of thing that pages someone at 3am. */
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Request body is too large.');
  });

  it('rejects malformed JSON with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", ');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body was not valid JSON.');
    expect(res.body.requestId).toBeDefined();
  });
});
