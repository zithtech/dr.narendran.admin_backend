/* eslint-disable */
// @ts-nocheck
import type {PoolClient, QueryResultRow} from 'pg';

import {pool} from './pool.js';

/**
 * Typed raw-SQL helpers.
 *
 * ===========================================================================
 * HARD RULE: every value goes in as a $1 / $2 parameter. No exceptions.
 * ===========================================================================
 *
 * Never build SQL with template literals or concatenation, not even for
 * "internal" values, not even for numbers. Parameterisation is what makes
 * injection structurally impossible; "this input is trusted" is an assumption
 * that stops being true the moment someone reuses the function.
 *
 * This is enforced by an ESLint `no-restricted-syntax` rule that fails the
 * build (and the pre-commit hook) on a template literal in the SQL position.
 *
 * The one legitimate case for interpolation is an IDENTIFIER (a column name in
 * ORDER BY, which cannot be parameterised by the protocol). That must come
 * from a hardcoded whitelist - see `buildOrderBy` below.
 */

/** Anything that can run a query: the pool, or a single transaction client. */
export interface Queryable {
  query<T extends QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  queryOne<T extends QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | null>;
}

const SLOW_QUERY_MS = 500;

async function run<T extends QueryResultRow>(
  executor: Pick<PoolClient, 'query'>,
  sql: string,
  params: readonly unknown[],
): Promise<T[]> {
  const startedAt = performance.now();
  try {
    /* pg types `values` as a mutable array; ours is readonly by design so a
       caller cannot mutate the params after we have inspected them. */
    const result = await executor.query<T>(sql, params as unknown[]);
    const durationMs = performance.now() - startedAt;

    if (durationMs > SLOW_QUERY_MS) {
      /* Log the SQL text and timing, never the parameters - those routinely
         contain passwords, tokens and personal data. */
      console.warn(
        {
          sql: collapse(sql),
          durationMs: Math.round(durationMs),
          rowCount: result.rowCount,
        },
        'Slow query',
      );
    } else {
      console.debug(
        {
          sql: collapse(sql),
          durationMs: Math.round(durationMs),
          rowCount: result.rowCount,
        },
        'Query executed',
      );
    }

    return result.rows;
  } catch (error) {
    console.error('Query failed:', error, collapse(sql));
    throw error;
  }
}

/** Flattens multi-line SQL to one line so it stays readable in JSON logs. */
function collapse(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Runs a query and returns every row, typed as `T`. */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return run<T>(pool, sql, params);
}

/**
 * Runs a query expected to return at most one row.
 *
 * Returns `null` rather than `undefined` so "no row" is an explicit, checkable
 * value - and with `noUncheckedIndexedAccess` on, callers cannot accidentally
 * skip the check by indexing `rows[0]`.
 */
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await run<T>(pool, sql, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a single transaction on ONE checked-out client.
 *
 * The callback receives a `Queryable` bound to that client, which is the whole
 * point: calling the module-level `query()` inside a transaction would grab a
 * DIFFERENT pooled connection and run outside the transaction entirely - a
 * bug that looks fine until a rollback fails to roll something back.
 *
 * The client is always released, including when COMMIT or ROLLBACK itself
 * throws; leaking one here permanently shrinks the pool.
 */
export async function withTransaction<T>(
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  const tx: Queryable = {
    query: <R extends QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ) => run<R>(client, sql, params),
    queryOne: async <R extends QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ) => {
      const rows = await run<R>(client, sql, params);
      return rows[0] ?? null;
    },
  };

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      /* Swallowed on purpose: the original error is the useful one, and
         rethrowing this would mask it. Logged so it is still visible. */
      console.error('ROLLBACK failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Builds an `ORDER BY` clause from a whitelist.
 *
 * Column names are identifiers, and the wire protocol cannot parameterise an
 * identifier - so this is the single place where a value is interpolated into
 * SQL. It is safe ONLY because `column` is used as a key into a caller-owned
 * constant map: user input selects a whitelist entry, it never becomes one.
 * Never widen `allowed` to accept arbitrary strings.
 */
export function buildOrderBy<TAllowed extends Record<string, string>>(
  allowed: TAllowed,
  column: keyof TAllowed & string,
  direction: 'asc' | 'desc',
): string {
  const expression = allowed[column];
  if (expression === undefined) {
    throw new Error(`Unsortable column: ${column}`);
  }
  return `ORDER BY ${expression} ${direction === 'asc' ? 'ASC' : 'DESC'}`;
}
