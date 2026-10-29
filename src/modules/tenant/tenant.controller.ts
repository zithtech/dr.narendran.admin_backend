/* eslint-disable */
// @ts-nocheck
import type {Request, Response, NextFunction} from 'express';
import {z} from 'zod';
import {pool as masterPool} from '@/db/pool.js';
import {getTenantPool} from '@/db/tenant-pool.js';
import {env} from '@/config/env.js';

// Extend Express Request to hold the tenant DB name
declare module 'express-serve-static-core' {
  interface Request {
    tenantDbName?: string;
  }
}

/**
 * Middleware to resolve the tenant from a header (e.g., x-tenant-code)
 * and attach the corresponding database name to the request.
 */
export const resolveTenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const tenantCode = req.headers['x-tenant-code'] as string;

  if (!tenantCode) {
    res.status(400).json({error: 'Missing x-tenant-code header'});
    return;
  }

  const client = await masterPool.connect();
  try {
    const {rows} = await client.query(
      'SELECT database_name, status FROM tenants WHERE tenant_code = $1',
      [tenantCode],
    );

    if (rows.length === 0) {
      res.status(404).json({error: 'Tenant not found'});
      return;
    }

    const tenant = rows[0];
    if (tenant.status !== 'ACTIVE') {
      res.status(403).json({error: 'Tenant is inactive'});
      return;
    }

    // Attach db name to request for downstream handlers
    req.tenantDbName = tenant.database_name;
    next();
  } catch (error) {
    console.error('Failed to resolve tenant:', tenantCode, error);
    res.status(500).json({error: 'Internal server error'});
  } finally {
    client.release();
  }
};

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const TenantController = {
  /**
   * Logs a user (Tenant Admin) into the specific tenant portal.
   * Authenticates against the tenant_admin_master_login table in the Master DB.
   */
  async login(req: Request, res: Response) {
    try {
      const {username, password} = loginSchema.parse(req.body);
      const tenantCode = req.headers['x-tenant-code'] as string;

      const masterClient = await masterPool.connect();
      try {
        const {rows} = await masterClient.query(
          `SELECT t_admin.id, t_admin.password_hash, t_admin.role, t_admin.status, t.database_name 
           FROM tenant_admin_master_login t_admin
           JOIN tenants t ON t.id = t_admin.tenant_id
           WHERE t_admin.username = $1 AND t.tenant_code = $2`,
          [username, tenantCode],
        );

        if (rows.length === 0) {
          res.status(401).json({error: 'Invalid credentials or tenant code'});
          return;
        }

        const user = rows[0];

        if (user.status !== 'ACTIVE') {
          res.status(403).json({error: 'User account is inactive'});
          return;
        }

        const {verify} = await import('argon2');
        const isValid = await verify(user.password_hash, password);

        if (!isValid) {
          res.status(401).json({error: 'Invalid credentials'});
          return;
        }

        const jwt = await import('jsonwebtoken');
        const token = jwt.default.sign(
          {id: user.id, role: user.role, tenantDb: user.database_name},
          env.JWT_SECRET,
          {expiresIn: env.JWT_EXPIRES_IN as any},
        );

        res.json({token, role: user.role});
      } finally {
        masterClient.release();
      }
    } catch (err) {
      res.status(400).json({error: 'Invalid request data'});
    }
  },

  /**
   * Example tenant-specific endpoint
   */
  async getDashboardStats(req: Request, res: Response) {
    const dbName = req.tenantDbName!;
    const tenantPool = getTenantPool(dbName);
    const client = await tenantPool.connect();

    try {
      // In a real app we'd query doctors, patients, etc. from this specific tenant DB.
      // For now, we'll just return a success message proving we connected to the right DB.
      const {rows} = await client.query('SELECT current_database() as db');

      res.json({
        message: 'Welcome to your isolated tenant dashboard',
        database: rows[0].db,
      });
    } catch (err) {
      res.status(500).json({error: 'Failed to fetch dashboard stats'});
    } finally {
      client.release();
    }
  },
};
