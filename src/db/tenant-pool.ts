/* eslint-disable */
// @ts-nocheck
import pg from 'pg';

import {env} from '@/config/env.js';

const {Pool} = pg;

// Map of database_name -> pg.Pool
const tenantPools = new Map<string, pg.Pool>();

/**
 * Returns a connection pool for the given database name.
 * Creates it if it doesn't exist, using the credentials from DATABASE_URL_ACTIVE.
 */
export function getTenantPool(databaseName: string): pg.Pool {
  if (tenantPools.has(databaseName)) {
    return tenantPools.get(databaseName)!;
  }

  console.log(
    `Creating new Postgres pool for tenant database: ${databaseName}`,
  );

  // Parse the master connection string and replace the database name
  const masterUrl = new URL(env.DATABASE_URL_ACTIVE);
  masterUrl.pathname = `/${databaseName}`;
  const tenantConnectionString = masterUrl.toString();

  const newPool = new Pool({
    connectionString: tenantConnectionString,
    ssl: env.DB_SSL
      ? {rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED}
      : false,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: `drnarendran-api-${databaseName}`,
  });

  newPool.on('error', (error: Error) => {
    console.error(
      `Unexpected error on idle tenant Postgres client for ${databaseName}:`,
      error,
    );
  });

  tenantPools.set(databaseName, newPool);
  return newPool;
}

/**
 * Closes all active tenant connection pools.
 * Useful for graceful shutdown.
 */
export async function closeAllTenantPools(): Promise<void> {
  console.log(`Closing ${tenantPools.size} tenant pools`);
  const promises = [];
  for (const [dbName, p] of tenantPools.entries()) {
    promises.push(p.end().then(() => console.log(`Closed pool for ${dbName}`)));
  }
  await Promise.all(promises);
  tenantPools.clear();
}
