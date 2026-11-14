/* eslint-disable */
// @ts-nocheck
import type { Request, Response } from 'express';
import { z } from 'zod';
import { tenantAuthService } from './tenant.auth.service.js';
import { signAccessToken } from '@/modules/auth/tokens.js';
import type { UserRole } from '@/modules/users/users.types.js';

const loginSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const username = obj['username'] ?? obj['email'] ?? obj['identifier'];
      const tenantCode = obj['tenantCode'] ?? obj['tenant_code'];
      return { ...obj, username, tenantCode };
    }
    return val;
  },
  z.object({
    tenantCode: z.string().min(1, 'Tenant code is required.'),
    username: z.string().min(1, 'Username or email is required.'),
    password: z.string().min(1, 'Password is required.'),
  }),
);

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
          : rawRole === 'doctor'
          ? 'doctor'
          : rawRole === 'patient'
          ? 'patient'
          : 'admin';

      const token = signAccessToken({
        sub: String(user.id),
        email: user.username || 'admin@drnarendran.com',
        role,
        tokenVersion: 0,
      });

      res.json({ token, role: user.role, id: user.id, username: user.username });
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
      const username = req.body.username || req.body.email || req.body.identifier;
      const password = req.body.password;

      if (!username || typeof username !== 'string' || !username.trim()) {
        res.status(400).json({ error: 'Username or email is required.' });
        return;
      }
      if (!password || typeof password !== 'string') {
        res.status(400).json({ error: 'Password is required.' });
        return;
      }

      const user = await tenantAuthService.adminLogin(username.trim(), password);

      const rawRole = (user.role || '').toLowerCase();
      const role: UserRole =
        rawRole === 'super_admin' || rawRole === 'admin'
          ? 'admin'
          : rawRole === 'doctor'
          ? 'doctor'
          : rawRole === 'patient'
          ? 'patient'
          : 'admin';

      const token = signAccessToken({
        sub: String(user.id),
        email: user.username || 'admin@drnarendran.com',
        role,
        tokenVersion: 0,
      });

      res.json({ token, role: user.role, id: user.id, username: user.username });
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

  async forgotPassword(req: Request, res: Response) {
    try {
      const identifier = req.body.identifier || req.body.username || req.body.email || req.body.phone;
      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        res.status(400).json({ error: 'Username, email, or mobile number is required.' });
        return;
      }
      res.json({
        message: 'If the account exists, a password reset request has been processed.',
        identifier: identifier.trim(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to process forgot password request' });
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const identifier = req.body.identifier || req.body.username || req.body.email || req.body.phone;
      const newPassword = req.body.password || req.body.newPassword;

      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        res.status(400).json({ error: 'Username, email, or mobile number is required.' });
        return;
      }

      // If only identifier is provided, treat as forgot-password trigger
      if (!newPassword) {
        res.json({
          message: 'If the account exists, a password reset request has been processed.',
          identifier: identifier.trim(),
        });
        return;
      }

      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const updated = await tenantAuthService.resetPassword(identifier.trim(), newPassword);
      if (!updated) {
        res.status(404).json({ error: 'Account not found for the provided identifier.' });
        return;
      }

      res.json({ message: 'Password has been reset successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reset password.' });
    }
  },
};
