/* eslint-disable */
// @ts-nocheck
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '@/db/pool.js';
import { masterService } from './master.service.js';
import { env } from '@/config/env.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

export const MasterController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT id, name, email, role, status, password_hash
           FROM master_admin_users WHERE email = $1`,
          [email],
        );

        if (rows.length === 0) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const user = rows[0];

        if (user.status !== 'ACTIVE') {
          res.status(403).json({ error: 'Account is inactive' });
          return;
        }

        const { verify } = await import('argon2');
        const isValid = await verify(user.password_hash, password);

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
    } catch (err) {
      res.status(400).json({ error: 'Invalid request data' });
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
