/* eslint-disable */
// @ts-nocheck
import { hash, verify } from 'argon2';
import { pool } from '@/db/pool.js';
import { getTenantPool } from '@/db/tenant-pool.js';

export class TenantAuthService {
  async getDatabaseNameForTenantCode(
    tenantCode: string,
  ): Promise<string | null> {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT database_name FROM tenants WHERE tenant_code = $1',
        [tenantCode],
      );
      if (rows.length === 0) return null;
      return rows[0].database_name;
    } finally {
      client.release();
    }
  }

  async login(tenantCode: string, username: string, passwordPlain: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `
        SELECT a.id, a.username, a.password_hash, a.role, a.status, t.database_name 
        FROM tenant_admin_master_login a
        JOIN tenants t ON a.tenant_id = t.id
        WHERE a.username = $1 AND t.tenant_code = $2
      `,
        [username, tenantCode],
      );

      if (rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = rows[0];
      if (user.status !== 'ACTIVE') {
        throw new Error('Account is inactive');
      }

      const isValid = await verify(user.password_hash, passwordPlain);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantCode,
        databaseName: user.database_name,
      };
    } finally {
      client.release();
    }
  }

  async adminLogin(username: string, passwordPlain: string) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `
        SELECT a.id, a.username, a.password_hash, a.role, a.status, r.is_system_role 
        FROM admin_users a
        LEFT JOIN rbac_roles r ON a.role = r.name
        WHERE lower(a.username) = lower($1)
      `,
        [username],
      );

      if (rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = rows[0];
      if (user.status !== 'ACTIVE') {
        throw new Error('Account is inactive');
      }

      // Client portal users (custom RBAC roles with is_system_role = false) cannot log into the Admin Portal
      if (user.role !== 'SUPER_ADMIN' && user.is_system_role === false) {
        throw new Error('Client portal accounts cannot access the Admin Portal. Please use the Client Portal login page.');
      }

      const isValid = await verify(user.password_hash, passwordPlain);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      return {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    } finally {
      client.release();
    }
  }
}

export const tenantAuthService = new TenantAuthService();
