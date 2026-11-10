/* eslint-disable */
// @ts-nocheck
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '@/db/pool.js';
import { masterService } from './master.service.js';
import { env } from '@/config/env.js';

const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

const createTenantSchema = z.object({
  tenantName: z.string().min(2),
  databaseName: z.string().min(2),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const updateTenantSchema = z.object({
  tenantName: z.string().min(2).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

let masterTablesEnsured = false;

async function ensureMasterTables(client: any): Promise<void> {
  if (masterTablesEnsured) return;
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_code varchar(50) NOT NULL UNIQUE,
        tenant_name varchar(255) NOT NULL,
        database_name varchar(255) NOT NULL UNIQUE,
        status varchar(50) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
        updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS tenant_admin_master_login (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        username varchar(255) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        phone varchar(50),
        role varchar(50) NOT NULL DEFAULT 'SUPER_ADMIN',
        status varchar(50) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
        updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
      );

      CREATE TABLE IF NOT EXISTS master_admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(255) NOT NULL,
        email varchar(255) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role varchar(50) NOT NULL DEFAULT 'Super Admin',
        status varchar(50) NOT NULL DEFAULT 'ACTIVE',
        reset_token varchar(255),
        reset_token_expires_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
        updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp
      );
    `);

    // Check if master_admin_users has any users; if not, seed default admin
    const countRes = await client.query('SELECT COUNT(*) as count FROM master_admin_users');
    if (parseInt(countRes.rows[0]?.count || '0', 10) === 0) {
      const { hash } = await import('argon2');
      const pwdHash = await hash('admin');
      await client.query(`
        INSERT INTO master_admin_users (name, email, password_hash, role, status)
        VALUES 
          ('Master Admin', 'master@drnarendran.com', $1, 'Super Admin', 'ACTIVE'),
          ('Admin', 'admin', $1, 'Super Admin', 'ACTIVE')
        ON CONFLICT DO NOTHING
      `, [pwdHash]);
    }
    masterTablesEnsured = true;
  } catch (err) {
    console.error('Error auto-creating master tables:', err);
  }
}

export const MasterController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const client = await pool.connect();
      try {
        await ensureMasterTables(client);

        let { rows } = await client.query(
          `SELECT id, name, email, role, status, password_hash
           FROM master_admin_users 
           WHERE LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1)
           LIMIT 1`,
          [email],
        );

        // Fallback: if not found in master_admin_users, check user_accounts for admin users
        if (rows.length === 0) {
          const fallbackRes = await client.query(
            `SELECT id, username as name, username as email, role, status, password_hash
             FROM user_accounts
             WHERE (LOWER(username) = LOWER($1) OR LOWER(username) = LOWER(REGEXP_REPLACE($1, '\\s+', '', 'g')))
               AND LOWER(role) IN ('admin', 'super_admin', 'doctor')
             LIMIT 1`,
            [email],
          );
          if (fallbackRes.rows.length > 0) {
            rows = fallbackRes.rows;
          }
        }

        // Fallback: check admin_users
        if (rows.length === 0) {
          const adminUsersRes = await client.query(
            `SELECT id, username as name, username as email, role, status, password_hash
             FROM admin_users
             WHERE LOWER(username) = LOWER($1)
             LIMIT 1`,
            [email],
          );
          if (adminUsersRes.rows.length > 0) {
            rows = adminUsersRes.rows;
          }
        }

        if (rows.length === 0) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const user = rows[0];

        if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
          res.status(403).json({ error: 'Account is inactive' });
          return;
        }

        let isValid = false;
        try {
          const { verify } = await import('argon2');
          isValid = await verify(user.password_hash, password);
        } catch {
          if (user.password_hash === password) {
            isValid = true;
          }
        }

        if (!isValid) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const { signAccessToken } = await import('@/modules/auth/tokens.js');
        const rawRole = (user.role || '').toLowerCase();
        const role = rawRole === 'super_admin' || rawRole === 'admin' ? 'admin' : rawRole;
        const token = signAccessToken({
          sub: String(user.id),
          email: user.email || 'master@drnarendran.com',
          role: role as any,
          tokenVersion: 0,
        });

        res.json({ token, role: user.role, name: user.name, email: user.email });
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return void res.status(400).json({ error: err.issues[0]?.message || 'Invalid request data' });
      }
      res.status(400).json({ error: err?.message || 'Invalid request data' });
    }
  },

  async createTenant(req: Request, res: Response) {
    try {
      const { tenantName, databaseName, status } = createTenantSchema.parse(
        req.body,
      );

      const result = await masterService.createTenant(
        tenantName,
        databaseName,
        status,
      );

      res.status(201).json({
        message: 'Tenant created successfully',
        data: result,
      });
    } catch (err: any) {
      console.error('Create tenant failed:', err);
      res
        .status(500)
        .json({ error: 'Failed to create tenant', details: err.message });
    }
  },

  async listTenants(req: Request, res: Response) {
    const client = await pool.connect();
    try {
      await ensureMasterTables(client);
      const { rows } = await client.query(
        'SELECT id, tenant_code, tenant_name, database_name, status, created_at FROM tenants ORDER BY created_at DESC',
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch tenants' });
    } finally {
      client.release();
    }
  },

  async getTenant(req: Request, res: Response) {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await ensureMasterTables(client);
      const { rows } = await client.query(
        'SELECT id, tenant_code, tenant_name, database_name, status, created_at FROM tenants WHERE id = $1',
        [id],
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch tenant' });
    } finally {
      client.release();
    }
  },

  async updateTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = updateTenantSchema.parse(req.body);

      const result = await masterService.updateTenant(id as string, updates);
      res.json({ message: 'Tenant updated', data: result });
    } catch (err: any) {
      res
        .status(400)
        .json({ error: 'Failed to update tenant', details: err.message });
    }
  },

  async deleteTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await masterService.deleteTenant(id);
      res.json({ message: 'Tenant deleted successfully' });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: 'Failed to delete tenant', details: err.message });
    }
  },

  // --- Admin Master Login Management ---

  async listTenantAdmins(req: Request, res: Response) {
    try {
      const data = await masterService.listTenantAdmins();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch tenant admins' });
    }
  },

  async createTenantAdmin(req: Request, res: Response) {
    try {
      const schema = z.object({
        tenantId: z.string().uuid(),
        name: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(6),
        phone: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      });
      const { tenantId, name, username, password, phone, role, status } = schema.parse(
        req.body,
      );
      const data = await masterService.createTenantAdmin(
        tenantId,
        name,
        username,
        password,
        phone,
        role,
        status,
      );
      res.status(201).json({ message: 'Admin created successfully', data });
    } catch (err: any) {
      if (err.message === 'Admin username already exists') {
        res.status(400).json({ error: err.message });
      } else {
        res.status(400).json({ error: `Failed to create admin: ${err.message}` });
      }
    }
  },

  async updateTenantAdminStatus(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const schema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
      const { status } = schema.parse(req.body);

      await masterService.updateTenantAdminStatus(adminId as string, status);
      res.json({ message: 'Admin status updated' });
    } catch (err: any) {
      res.status(400).json({ error: 'Failed to update admin status' });
    }
  },

  async updateTenantAdminPassword(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const schema = z.object({ password: z.string().min(6) });
      const { password } = schema.parse(req.body);

      await masterService.updateTenantAdminPassword(
        adminId as string,
        password,
      );
      res.json({ message: 'Admin password updated' });
    } catch (err: any) {
      res.status(400).json({ error: 'Failed to update admin password' });
    }
  },
  async updateTenantAdmin(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const schema = z.object({
        name: z.string().min(1).optional(),
        username: z.string().min(1),
        password: z.string().min(6).optional(),
        phone: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      });
      const { name, username, password, phone, role, status } = schema.parse(req.body);

      await masterService.updateTenantAdmin(
        adminId as string,
        name,
        username,
        password,
        phone,
        role,
        status,
      );
      res.json({ message: 'Admin updated' });
    } catch (err: any) {
      console.error('Error in updateTenantAdmin:', err);
      if (err.message === 'Admin username already exists') {
        res.status(400).json({ error: err.message });
      } else {
        res.status(400).json({ error: `Failed to update admin: ${err.message}` });
      }
    }
  },

  async deleteTenantAdmin(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      await masterService.deleteTenantAdmin(adminId as string);
      res.json({ message: 'Admin deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete admin' });
    }
  },

  // ── master_admin_users CRUD ─────────────────────────────────────────────────

  async listMasterAdminUsers(_req: Request, res: Response) {
    try {
      const data = await masterService.listMasterAdminUsers();
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to list admin users' });
    }
  },

  async createMasterAdminUser(req: Request, res: Response) {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.string().min(1),
      status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    });
    try {
      const { name, email, password, role, status } = schema.parse(req.body);
      const data = await masterService.createMasterAdminUser(
        name,
        email,
        password,
        role,
        status,
      );
      res.status(201).json(data);
    } catch (err: any) {
      if (err.message === 'Email already exists')
        return void res.status(400).json({ error: err.message });
      res.status(500).json({ error: 'Failed to create admin user' });
    }
  },

  async updateMasterAdminUser(req: Request, res: Response) {
    const schema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    });
    try {
      const id = parseInt(req.params['id'] as string, 10);
      const raw = schema.parse(req.body);
      // Strip undefined fields to satisfy exactOptionalPropertyTypes
      const updates: {
        name?: string;
        email?: string;
        role?: string;
        status?: string;
      } = {};
      if (raw.name !== undefined) updates.name = raw.name;
      if (raw.email !== undefined) updates.email = raw.email;
      if (raw.role !== undefined) updates.role = raw.role;
      if (raw.status !== undefined) updates.status = raw.status;
      const data = await masterService.updateMasterAdminUser(id, updates);
      if (!data)
        return void res.status(404).json({ error: 'Admin user not found' });
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to update admin user' });
    }
  },

  async updateMasterAdminUserPassword(req: Request, res: Response) {
    const schema = z.object({ password: z.string().min(6) });
    try {
      const id = parseInt(req.params['id'] as string, 10);
      const { password } = schema.parse(req.body);
      await masterService.updateMasterAdminUserPassword(id, password);
      res.json({ message: 'Password updated' });
    } catch {
      res.status(500).json({ error: 'Failed to update password' });
    }
  },

  async deleteMasterAdminUser(req: Request, res: Response) {
    try {
      const id = parseInt(req.params['id'] as string, 10);
      const deleted = await masterService.deleteMasterAdminUser(id);
      if (!deleted)
        return void res.status(404).json({ error: 'Admin user not found' });
      res.json({ message: 'Admin user deleted' });
    } catch {
      res.status(500).json({ error: 'Failed to delete admin user' });
    }
  },

  async forgotPassword(req: Request, res: Response) {
    const schema = z.object({ email: z.string().email() });
    try {
      const { email } = schema.parse(req.body);
      await masterService.generatePasswordResetToken(email);
      res.json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (err: any) {
      if (err.message === 'User not found or inactive') {
        // Return success anyway to prevent email enumeration
        return void res.json({
          message: 'If the email exists, a reset link has been sent.',
        });
      }
      console.error(err);
      res
        .status(500)
        .json({ error: 'Failed to process forgot password request' });
    }
  },

  async resetPassword(req: Request, res: Response) {
    const schema = z.object({
      token: z.string().min(1),
      password: z.string().min(6),
    });
    try {
      const { token, password } = schema.parse(req.body);
      await masterService.resetPasswordWithToken(token, password);
      res.json({ message: 'Password has been reset successfully.' });
    } catch (err: any) {
      if (err.message === 'Invalid or expired token') {
        return void res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  },
};
