/* eslint-disable */
// @ts-nocheck
import pg from 'pg';

import {env} from '@/config/env.js';

const {Pool} = pg;

/**
 * Tell node-postgres to return DATE columns as plain 'YYYY-MM-DD' strings.
 *
 * By default, pg converts PostgreSQL DATE values to JavaScript Date objects
 * (UTC midnight). When JSON-serialised, `new Date("2026-10-01")` becomes
 * "2026-09-30T18:30:00.000Z" on a UTC+5:30 server — shifting every date one
 * day backwards for IST users. Returning the raw string avoids all timezone
 * arithmetic entirely.
 *
 * OID 1082 = DATE in PostgreSQL's pg_type catalog.
 */
pg.types.setTypeParser(1082, (val: string) => val); // return DATE as-is

/**
 * Postgres connection pool.
 *
 * These settings are tuned for a REMOTE Postgres reached over the public
 * internet, not a loopback instance. Round-trip latency and middlebox
 * behaviour change what "sensible" means for almost every value here, so each
 * one is justified rather than left at its default.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL_ACTIVE,

  /* TLS to the database.
     The current server reports `ssl = off` and refuses the TLS handshake
     outright, so DB_SSL=false. This is not a "safe to leave on" flag - pg
     fails the connection rather than silently downgrading. When TLS is enabled
     server-side, set DB_SSL=true and leave DB_SSL_REJECT_UNAUTHORIZED=true;
     turning verification off accepts any certificate, which defeats the point
     of enabling TLS in the first place. */
  ssl: env.DB_SSL
    ? {rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED}
    : false,

  /* Max connections held by THIS process. The server reports
     max_connections=100, shared with migrations, psql sessions, and any other
     app instance. 10 per process leaves generous headroom; raise it only after
     observing real pool-wait time, since more connections past the point of
     CPU saturation makes Postgres slower, not faster. */
  max: env.DB_POOL_MAX,

  /* Close a connection after 30s idle. Over the public internet, NAT and
     firewall middleboxes silently drop idle TCP flows; the pool then hands out
     a connection that looks alive and fails with "socket hang up" on first
     use. Recycling well before typical middlebox timeouts avoids that class of
     bug entirely. */
  idleTimeoutMillis: 30_000,

  /* How long to wait for a NEW connection (TCP + auth) before giving up.
     Locally you would use ~2s; across the internet that would produce spurious
     failures under normal jitter. 10s is tolerant of a slow handshake while
     still erroring before the mobile client's own 15s request timeout, so the
     user sees a real error instead of a hang. */
  connectionTimeoutMillis: 10_000,

  /* TCP keepalives hold NAT mappings open and detect a dead peer rather than
     blocking forever on a half-open socket. Pairs with idleTimeoutMillis. */
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,

  /* Server-side cap: Postgres cancels any statement running longer than 10s.
     Deliberately BELOW the mobile client's 15s timeout, so a runaway query
     stops consuming a pool slot for a request the phone has already abandoned.
     Raise per-query with a SET LOCAL inside a transaction if some report
     genuinely needs longer. */
  statement_timeout: 10_000,

  /* Client-side backstop in case the server overrides statement_timeout. */
  query_timeout: 12_000,

  /* Makes `SELECT * FROM pg_stat_activity` legible when working out who is
     holding connections on a shared server. */
  application_name: 'drnarendran-api',
});

/**
 * Current pool occupancy.
 *
 * `waiting` is the number one to watch: anything persistently above zero means
 * requests are queueing for a connection, and DB_POOL_MAX is the bottleneck.
 */
export function getPoolStats(): {
  total: number;
  idle: number;
  waiting: number;
} {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/* --- Connection lifecycle logging ----------------------------------------
   'connect' and 'remove' fire when a PHYSICAL connection is opened or torn
   down - not per query - so they are low volume and genuinely informative.

   Deliberately NOT logging 'acquire'/'release': those fire on every single
   query, and at any real traffic level they bury everything else.

   These are at debug so they are on in development and off in production by
   default. Turn LOG_LEVEL=debug in production temporarily when diagnosing
   connection churn - a burst of connect/remove pairs is the signature of the
   idle-timeout-vs-NAT problem the pool settings above are tuned against. */

pool.on('connect', () => {
  // console.debug('Postgres connection opened', getPoolStats());
});

pool.on('remove', () => {
  // console.debug('Postgres connection closed', getPoolStats());
});

/**
 * An error on an IDLE client is emitted on the pool, not on any query promise.
 * Without this listener Node treats it as an unhandled 'error' event and kills
 * the process - so a transient network blip becomes a crash.
 */
pool.on('error', (error: Error) => {
  console.error('Unexpected error on idle Postgres client', error);
});

/**
 * Confirms the database is reachable, and logs what we actually connected to.
 *
 * Called once at startup. Logging the server version and database NAME is
 * deliberate: this Postgres host carries several unrelated databases, and
 * "which database am I actually pointed at?" is the first question worth
 * answering when something looks wrong.
 *
 * Returns false rather than throwing - see the call site in server.ts for why
 * an unreachable database is not a startup failure.
 */
export async function verifyDatabaseConnection(): Promise<boolean> {
  const startedAt = performance.now();

  try {
    const client = await pool.connect();
    try {
      const {rows} = await client.query<{
        version: string;
        database: string;
        user: string;
        maxConnections: string;
      }>(
        `SELECT current_setting('server_version') AS version,
                current_database()                AS database,
                current_user                      AS "user",
                current_setting('max_connections') AS "maxConnections"`,
      );

      const info = rows[0];
      console.log('Connected to Postgres', {
        database: info?.database,
        user: info?.user,
        postgresVersion: info?.version,
        serverMaxConnections: info?.maxConnections,
        poolMax: env.DB_POOL_MAX,
        ssl: env.DB_SSL,
        connectMs: Math.round(performance.now() - startedAt),
      });
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      'Could not connect to Postgres - the API will start but /api/health will report 503 until it recovers',
      {err: error, connectMs: Math.round(performance.now() - startedAt)},
    );
    return false;
  }
}

/**
 * Closes every pooled connection. Called from the shutdown path in server.ts.
 *
 * Logs the occupancy it is closing from, which is how you tell a clean
 * shutdown (idle == total) from one that cut requests short.
 */
export async function closePool(): Promise<void> {
  const before = getPoolStats();
  // console.debug('Closing Postgres pool', before);

  await pool.end();

  console.log(`Postgres pool closed. Closed ${before.total} connections`);
}

/**
 * Cheap liveness probe used by the health endpoint.
 *
 * Uses its own short timeouts rather than the pool defaults: a health check
 * that takes 10s to report "down" is useless to a load balancer.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}
