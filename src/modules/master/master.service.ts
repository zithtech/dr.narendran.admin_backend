/* eslint-disable */
// @ts-nocheck
import {pool} from '@/db/pool.js';
import {getTenantPool} from '@/db/tenant-pool.js';
import {env} from '@/config/env.js';
import pg from 'pg';
import * as pgMigrate from 'node-pg-migrate';
import crypto from 'crypto';

export class MasterService {
  /**
   * Creates a new tenant, provisions their database, and runs migrations.
   */
  async createTenant(
    tenantName: string,
    databaseName: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    // 1. Generate unique tenant code
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g., 'A1B2C3'
    const tenantCode = `T-${randomHex}`;

    console.log(
      `Starting tenant provisioning for: ${tenantName} (${tenantCode}, ${databaseName})`,
    );

    const client = await pool.connect();
    let tenantId: number;

    try {
      await client.query('BEGIN');

      // 2. Insert into tenants table
      const result = await client.query(
        `INSERT INTO tenants (tenant_code, tenant_name, database_name, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantCode, tenantName, databaseName, status],
      );
      tenantId = result.rows[0].id;

      // 3. Create actual database (Postgres doesn't allow CREATE DATABASE inside a transaction block)
      await client.query('COMMIT');

      console.log(`Creating PostgreSQL database: ${databaseName}`);
      await client.query(`CREATE DATABASE "${databaseName}"`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to provision tenant DB for ${tenantName}:`, error);
      throw error;
    } finally {
      client.release();
    }

    // 4. Run tenant migrations programmatically
    console.log(`Running tenant schema migrations for ${databaseName}`);

    const masterUrl = new URL(env.DATABASE_URL_ACTIVE);
    masterUrl.pathname = `/${databaseName}`;
    const tenantConnectionString = masterUrl.toString();

    const tenantClient = new pg.Client({
      connectionString: tenantConnectionString,
      ssl: env.DB_SSL
        ? {rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED}
        : false,
    });
    await tenantClient.connect();

    try {
      // @ts-ignore
      const migrate =
        pgMigrate.runner ||
        pgMigrate.default?.default ||
        pgMigrate.default ||
        pgMigrate;

      await migrate({
        dbClient: tenantClient,
        dir: 'migrations-tenant',
        direction: 'up',
        migrationsTable: 'pgmigrations',
        log: () => {}, // silence output
      });

      console.log(
        `Tenant migrations completed successfully for ${databaseName}`,
      );
    } catch (error) {
      console.error(
        `Failed to run tenant migrations or seed for ${databaseName}:`,
        error,
      );
      throw error;
    } finally {
      await tenantClient.end();
    }

    return {
      tenantId,
      tenantCode,
      databaseName,
    };
  }

  /**
   * Updates an existing tenant's details.
   */
  async updateTenant(
    tenantId: string,
    updates: {
      tenantName?: string | undefined;
      status?: 'ACTIVE' | 'INACTIVE' | undefined;
    },
  ) {
    const client = await pool.connect();
    try {
      const setClauses = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.tenantName) {
        setClauses.push(`tenant_name = $${paramCount++}`);
        values.push(updates.tenantName);
      }
      if (updates.status) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }

      if (setClauses.length === 0) return null;

      values.push(tenantId);
      const query = `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`;

      const {rows} = await client.query(query, values);
      return rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Hard deletes a tenant row and drops their physical database.
   */
  async deleteTenant(tenantId: string) {
    const client = await pool.connect();
    let databaseName = '';
    let tenantName = '';

    try {
      // 1. Fetch DB name
      const {rows} = await client.query(
        'SELECT database_name, tenant_name FROM tenants WHERE id = $1',
        [tenantId],
      );
      if (rows.length === 0) {
        throw new Error('Tenant not found');
      }
      databaseName = rows[0].database_name;
      tenantName = rows[0].tenant_name;

      console.log(
        `Starting hard delete of tenant ${tenantName} (ID: ${tenantId}, DB: ${databaseName})`,
      );

      // 2. Delete the row from the Master DB (cascades to tenant_admin_master_login)
      await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);

      // 3. Drop the physical database
      // Must not be in a transaction block
      console.log(`Dropping PostgreSQL database: ${databaseName}`);

      // We must close all existing connections to the DB before dropping it.
      // In PostgreSQL we can terminate connections:
      await client.query(
        `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
      `,
        [databaseName],
      );

      await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);

      console.log(`Tenant ${tenantName} deleted successfully`);
      return {success: true};
    } catch (error) {
      console.error(`Failed to delete tenant ${tenantId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // --- Admin Master Login Management ---

  async listTenantAdmins() {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(`
        SELECT t.id as tenant_id, t.tenant_code, t.tenant_name, t.database_name,
               a.id as admin_id, a.name as admin_name, a.username, a.status as admin_status, a.phone, a.role as admin_role
        FROM tenants t
        LEFT JOIN tenant_admin_master_login a ON t.id = a.tenant_id
        ORDER BY t.created_at DESC
      `);
      return rows;
    } finally {
      client.release();
    }
  }

  async createTenantAdmin(
    tenantId: string,
    name: string,
    username: string,
    passwordPlain: string,
    phone?: string,
    role: string = 'SUPER_ADMIN',
    status: string = 'ACTIVE',
  ) {
    const {hash} = await import('argon2');
    const passwordHash = await hash(passwordPlain);
    const client = await pool.connect();
    try {
      // 1. Get the tenant DB name to insert into admin_users
      const {rows: tenantRows} = await client.query(
        'SELECT database_name FROM tenants WHERE id = $1',
        [tenantId],
      );
      if (tenantRows.length === 0) throw new Error('Tenant not found');
      const databaseName = tenantRows[0].database_name;

      // 2. Insert into Master DB
      const {rows} = await client.query(
        `INSERT INTO tenant_admin_master_login (tenant_id, name, username, password_hash, phone, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, status`,
        [tenantId, name, username, passwordHash, phone || null, role, status],
      );

      // 3. Sync to Tenant DB's admin_users table
      const tenantPool = getTenantPool(databaseName);
      const tenantClient = await tenantPool.connect();
      try {
        await tenantClient.query(
          `INSERT INTO admin_users (tenant_id, name, username, password_hash, phone, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, name, username, passwordHash, phone || null, role, status],
        );
      } finally {
        tenantClient.release();
      }

      return rows[0];
    } catch (err: any) {
      if (err.code === '23505') {
        throw new Error('Admin username already exists');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async updateTenantAdminStatus(
    adminId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    const client = await pool.connect();
    try {
      // 1. Get username and database_name to sync with Tenant DB
      const {rows: adminRows} = await client.query(
        `
        SELECT a.username, t.database_name 
        FROM tenant_admin_master_login a 
        JOIN tenants t ON a.tenant_id = t.id 
        WHERE a.id = $1
      `,
        [adminId],
      );

      if (adminRows.length === 0) throw new Error('Admin not found');
      const {username, database_name} = adminRows[0];

      // 2. Update Master DB
      await client.query(
        'UPDATE tenant_admin_master_login SET status = $1 WHERE id = $2',
        [status, adminId],
      );

      // 3. Sync to Tenant DB
      const tenantPool = getTenantPool(database_name);
      const tenantClient = await tenantPool.connect();
      try {
        await tenantClient.query(
          'UPDATE admin_users SET status = $1 WHERE username = $2',
          [status, username],
        );
      } finally {
        tenantClient.release();
      }
    } finally {
      client.release();
    }
  }

  async updateTenantAdminPassword(adminId: string, passwordPlain: string) {
    const {hash} = await import('argon2');
    const passwordHash = await hash(passwordPlain);
    const client = await pool.connect();
    try {
      // 1. Get username and database_name to sync with Tenant DB
      const {rows: adminRows} = await client.query(
        `
        SELECT a.username, t.database_name 
        FROM tenant_admin_master_login a 
        JOIN tenants t ON a.tenant_id = t.id 
        WHERE a.id = $1
      `,
        [adminId],
      );

      if (adminRows.length === 0) throw new Error('Admin not found');
      const {username, database_name} = adminRows[0];

      // 2. Update Master DB
      await client.query(
        'UPDATE tenant_admin_master_login SET password_hash = $1 WHERE id = $2',
        [passwordHash, adminId],
      );

      // 3. Sync to Tenant DB
      const tenantPool = getTenantPool(database_name);
      const tenantClient = await tenantPool.connect();
      try {
        await tenantClient.query(
          'UPDATE admin_users SET password_hash = $1 WHERE username = $2',
          [passwordHash, username],
        );
      } finally {
        tenantClient.release();
      }
    } finally {
      client.release();
    }
  }

  async updateTenantAdmin(
    adminId: string,
    name?: string,
    username?: string,
    passwordPlain?: string,
    phone?: string,
    role?: string,
    status?: string,
  ) {
    const client = await pool.connect();
    try {
      // 1. Get old username and database_name
      const {rows: adminRows} = await client.query(
        `
        SELECT a.username as old_username, t.database_name 
        FROM tenant_admin_master_login a 
        JOIN tenants t ON a.tenant_id = t.id 
        WHERE a.id = $1
      `,
        [adminId],
      );

      if (adminRows.length === 0) throw new Error('Admin not found');
      const {old_username, database_name} = adminRows[0];

      let passwordHash: string | undefined;
      if (passwordPlain) {
        const {hash} = await import('argon2');
        passwordHash = await hash(passwordPlain);
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let p = 1;

      if (username !== undefined) {
        setClauses.push(`username = $${p++}`);
        values.push(username);
      }
      if (name !== undefined) {
        setClauses.push(`name = $${p++}`);
        values.push(name);
      }

      if (passwordHash) {
        setClauses.push(`password_hash = $${p++}`);
        values.push(passwordHash);
      }
      if (phone !== undefined) {
        setClauses.push(`phone = $${p++}`);
        values.push(phone || null);
      }
      if (role !== undefined) {
        setClauses.push(`role = $${p++}`);
        values.push(role);
      }
      if (status !== undefined) {
        setClauses.push(`status = $${p++}`);
        values.push(status);
      }

      values.push(adminId);
      const queryStr = `UPDATE tenant_admin_master_login SET ${setClauses.join(', ')} WHERE id = $${p}`;
      await client.query(queryStr, values);

      // 3. Sync to Tenant DB
      const tenantPool = getTenantPool(database_name);
      const tenantClient = await tenantPool.connect();
      try {
        const tSetClauses: string[] = [];
        const tValues: any[] = [];
        let tp = 1;

        if (username !== undefined) {
          tSetClauses.push(`username = $${tp++}`);
          tValues.push(username);
        }
        if (name !== undefined) {
          tSetClauses.push(`name = $${tp++}`);
          tValues.push(name);
        }
        if (passwordHash) {
          tSetClauses.push(`password_hash = $${tp++}`);
          tValues.push(passwordHash);
        }
        if (phone !== undefined) {
          tSetClauses.push(`phone = $${tp++}`);
          tValues.push(phone || null);
        }
        if (role !== undefined) {
          tSetClauses.push(`role = $${tp++}`);
          tValues.push(role);
        }
        if (status !== undefined) {
          tSetClauses.push(`status = $${tp++}`);
          tValues.push(status);
        }
        tValues.push(old_username);
        const tQueryStr = `UPDATE admin_users SET ${tSetClauses.join(', ')} WHERE username = $${tp}`;
        await tenantClient.query(tQueryStr, tValues);
      } finally {
        tenantClient.release();
      }
    } catch (err: any) {
      if (err.code === '23505') {
        throw new Error('Admin username already exists');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteTenantAdmin(adminId: string) {
    const client = await pool.connect();
    try {
      // 1. Get username and database_name
      const {rows: adminRows} = await client.query(
        `
        SELECT a.username, t.database_name 
        FROM tenant_admin_master_login a 
        JOIN tenants t ON a.tenant_id = t.id 
        WHERE a.id = $1
      `,
        [adminId],
      );

      if (adminRows.length === 0) throw new Error('Admin not found');
      const {username, database_name} = adminRows[0];

      // 2. Delete from Master DB
      await client.query(
        'DELETE FROM tenant_admin_master_login WHERE id = $1',
        [adminId],
      );

      // 3. Sync to Tenant DB
      const tenantPool = getTenantPool(database_name);
      const tenantClient = await tenantPool.connect();
      try {
        await tenantClient.query(
          'DELETE FROM admin_users WHERE username = $1',
          [username],
        );
      } finally {
        tenantClient.release();
      }
      return true;
    } finally {
      client.release();
    }
  }

  // ── master_admin_users CRUD ─────────────────────────────────────────────────

  async listMasterAdminUsers() {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        'SELECT id, name, email, role, status, created_at FROM master_admin_users ORDER BY created_at DESC',
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async createMasterAdminUser(
    name: string,
    email: string,
    passwordPlain: string,
    role: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    const {hash} = await import('argon2');
    const passwordHash = await hash(passwordPlain);
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        `INSERT INTO master_admin_users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, status, created_at`,
        [name, email, passwordHash, role, status],
      );
      return rows[0];
    } catch (err: any) {
      if (err.code === '23505') throw new Error('Email already exists');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateMasterAdminUser(
    id: string,
    updates: {name?: string; email?: string; role?: string; status?: string},
  ) {
    const client = await pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let p = 1;
      if (updates.name !== undefined) {
        setClauses.push(`name = $${p++}`);
        values.push(updates.name);
      }
      if (updates.email !== undefined) {
        setClauses.push(`email = $${p++}`);
        values.push(updates.email);
      }
      if (updates.role !== undefined) {
        setClauses.push(`role = $${p++}`);
        values.push(updates.role);
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${p++}`);
        values.push(updates.status);
      }
      if (setClauses.length === 0) return null;
      values.push(id);
      const {rows} = await client.query(
        `UPDATE master_admin_users SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING id, name, email, role, status`,
        values,
      );
      return rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  async updateMasterAdminUserPassword(id: string, passwordPlain: string) {
    const {hash} = await import('argon2');
    const passwordHash = await hash(passwordPlain);
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE master_admin_users SET password_hash = $1 WHERE id = $2',
        [passwordHash, id],
      );
    } finally {
      client.release();
    }
  }

  async deleteMasterAdminUser(id: string) {
    const client = await pool.connect();
    try {
      const {rowCount} = await client.query(
        'DELETE FROM master_admin_users WHERE id = $1',
        [id],
      );
      return (rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async generatePasswordResetToken(email: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        'SELECT id, name FROM master_admin_users WHERE email = $1 AND status = $2',
        [email, 'ACTIVE'],
      );
      if (rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      const user = rows[0];

      // Step 1: Explicitly clear any existing token immediately —
      // ensures the old reset link is invalidated right away, even before the new email is sent.
      await client.query(
        'UPDATE master_admin_users SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = $1',
        [user.id],
      );

      // Step 2: Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Step 3: Send email — if this fails, no new token is stored, keeping the DB clean
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: env.SYSTEM_HOST,
        port: env.SYSTEM_PORT,
        secure: env.SYSTEM_SECURE,
        auth: {
          user: env.SYSTEM_EMAIL,
          pass: env.SYSTEM_APP_PASSWORD,
        },
      });

      const resetUrl = `http://localhost:5173/master/reset-password?token=${token}`;

      await transporter.sendMail({
        from: `"HMS Admin" <${env.SYSTEM_EMAIL}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
          <h3>Password Reset Request</h3>
          <p>Hello ${user.name},</p>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">Reset Password</a></p>
          <p>If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.</p>
          <p><em>Note: Any previously requested reset links are no longer valid.</em></p>
        `,
      });

      // Step 4: Only save the new token after email is confirmed sent
      await client.query(
        'UPDATE master_admin_users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
        [token, expiresAt, user.id],
      );

      return true;
    } finally {
      client.release();
    }
  }

  async resetPasswordWithToken(token: string, newPasswordPlain: string) {
    const client = await pool.connect();
    try {
      const {rows} = await client.query(
        'SELECT id FROM master_admin_users WHERE reset_token = $1 AND reset_token_expires_at > NOW() AND status = $2',
        [token, 'ACTIVE'],
      );

      if (rows.length === 0) {
        throw new Error('Invalid or expired token');
      }

      const userId = rows[0].id;
      const {hash} = await import('argon2');
      const passwordHash = await hash(newPasswordPlain);

      await client.query(
        'UPDATE master_admin_users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2',
        [passwordHash, userId],
      );

      return true;
    } finally {
      client.release();
    }
  }
}

export const masterService = new MasterService();
