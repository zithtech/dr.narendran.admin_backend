/* eslint-disable */
// @ts-nocheck
import type { Request, Response } from 'express';
import { z } from 'zod';
import { tenantAuthService } from './tenant.auth.service.js';
import { signAccessToken } from '@/modules/auth/tokens.js';
import type { UserRole } from '@/modules/users/users.types.js';

const loginSchema = z.object({
  tenantCode: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const TenantAuthController = {
  async login(req: Request, res: Response) {
    try {
      const { tenantCode, username, password } = loginSchema.parse(req.body);

      const user = await tenantAuthService.login(
        tenantCode,
        username,
        password,
      );

      const rawRole = (user.role || '').toLowerCase();
      const role: UserRole =
        rawRole === 'super_admin' || rawRole === 'admin'
          ? 'admin'
          : (rawRole as UserRole);

      const token = signAccessToken({
        sub: String(user.id),
        email: user.username || 'admin@drnarendran.com',
        role,
        tokenVersion: 0,
      });

      res.json({ token, role: user.role });
    } catch (err: any) {
      if (
        err.message === 'Tenant not found' ||
        err.message === 'Invalid credentials' ||
        err.message === 'Account is inactive'
      ) {
        res.status(401).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: 'Invalid request data' });
    }
  },

  async adminLogin(req: Request, res: Response) {
    try {
      const { username, password } = req.body;

      const user = await tenantAuthService.adminLogin(username, password);

      const rawRole = (user.role || '').toLowerCase();
      const role: UserRole =
        rawRole === 'super_admin' || rawRole === 'admin'
          ? 'admin'
          : (rawRole as UserRole);

      const token = signAccessToken({
        sub: String(user.id),
        email: user.username || 'admin@drnarendran.com',
        role,
        tokenVersion: 0,
      });

      res.json({ token, role: user.role });
    } catch (err: any) {
      if (
        err.message === 'Invalid credentials' ||
        err.message === 'Account is inactive' ||
        (err.message && err.message.includes('Client portal accounts'))
      ) {
        res.status(401).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: err.message || 'Invalid request data' });
    }
  },
};
