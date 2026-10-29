import type { PoolClient } from 'pg';

import { pool } from '@/db/pool.js';

import type { TransactionCallback } from '../types/service.types.js';

/**
 * Runs a query or batch of queries inside an automatic database transaction.
 * Guarantees BEGIN, COMMIT on success, ROLLBACK on error, and client release.
 */
export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Transaction Error] Rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Leases a client from the pool and automatically releases it upon completion.
 */
export async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
