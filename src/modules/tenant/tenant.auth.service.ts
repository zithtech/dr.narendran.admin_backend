/* eslint-disable */
// @ts-nocheck
import { hash, verify } from 'argon2';
import { pool } from '@/db/pool.js';
import { getTenantPool } from '@/db/tenant-pool.js';

async function verifyPasswordSafe(hashStr: string | null | undefined, plain: string): Promise<boolean> {
  if (!hashStr || !plain) return false;
  try {
    const isValid = await verify(hashStr, plain);
    if (isValid) return true;
  } catch {
    // Argon2 threw (e.g. malformed or not argon2 hash)
  }
  return hashStr === plain;
}

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

      const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
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
      const cleanIdentifier = (username || '').trim();

      // 1. Check admin_users table
      try {
        const { rows } = await client.query(
          `SELECT a.id, a.username, a.password_hash, a.role, a.status, r.is_system_role 
           FROM admin_users a
           LEFT JOIN rbac_roles r ON a.role = r.name
           WHERE lower(a.username) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            if (user.role !== 'SUPER_ADMIN' && user.is_system_role === false) {
              throw new Error('Client portal accounts cannot access the Admin Portal. Please use the Client Portal login page.');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role,
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive' || (err.message && err.message.includes('Client portal'))) {
          throw err;
        }
      }

      // 2. Check user_accounts table (accounts created inside Admin Panel - Admin, Doctor, Patient, etc.)
      try {
        const { rows } = await client.query(
          `SELECT id, username, password_hash, role, status
           FROM user_accounts
           WHERE lower(username) = lower($1)
              OR lower(username) = lower(REGEXP_REPLACE($1, '\\s+', '', 'g'))`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role,
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 3. Check master_admin_users table (Master Admin accounts like admin, master@drnarendran.com, etc.)
      try {
        const { rows } = await client.query(
          `SELECT id, name, email, password_hash, role, status
           FROM master_admin_users
           WHERE lower(email) = lower($1) OR lower(name) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.email || user.name,
              role: user.role || 'SUPER_ADMIN',
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 4. Check tenant_admin_master_login table
      try {
        const { rows } = await client.query(
          `SELECT id, username, password_hash, role, status
           FROM tenant_admin_master_login
           WHERE lower(username) = lower($1)`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
              throw new Error('Account is inactive');
            }
            return {
              id: user.id,
              username: user.username,
              role: user.role || 'ADMIN',
            };
          }
        }
      } catch (err: any) {
        if (err.message === 'Account is inactive') {
          throw err;
        }
      }

      // 5. Fallback: Check users table (mobile app users)
      try {
        const { rows } = await client.query(
          `SELECT id, phone, email, password_hash, role
           FROM users
           WHERE (email IS NOT NULL AND lower(email) = lower($1))
              OR phone = $1
              OR replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') = replace(replace(replace($1, ' ', ''), '-', ''), '+', '')`,
          [cleanIdentifier],
        );

        if (rows.length > 0) {
          const user = rows[0];
          const isValid = await verifyPasswordSafe(user.password_hash, passwordPlain);
          if (isValid) {
            return {
              id: user.id,
              username: user.email || user.phone,
              role: user.role || 'patient',
            };
          }
        }
      } catch (_err) {
        // ignore
      }

      throw new Error('Invalid credentials');
    } finally {
      client.release();
    }
  }
}

export const tenantAuthService = new TenantAuthService();
