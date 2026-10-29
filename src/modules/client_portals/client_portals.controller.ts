import type { Request, Response } from 'express';
import { z } from 'zod';
import { clientPortalsService } from './client_portals.service.js';

const schema = z.object({
  username: z.string().email('Must be a valid email'),
  password: z.string().optional(),
  role: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const clientLoginSchema = z.object({
  username: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
  portalToken: z.string().optional(),
});

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

export const clientPortalsController = {
  async getAll(_req: Request, res: Response) {
    const users = await clientPortalsService.getAll();
    res.json(users);
  },

  async create(req: Request, res: Response) {
    const data = schema.parse(req.body);
    const user = await clientPortalsService.create({
      username: data.username,
      password: data.password,
      role: data.role,
      status: data.status,
    });
    res.status(201).json(user);
  },

  async update(req: Request, res: Response) {
    const data = schema.parse(req.body);
    const id = getParam(req.params['id']);
    const user = await clientPortalsService.update(id, {
      username: data.username,
      password: data.password,
      role: data.role,
      status: data.status,
    });
    res.json(user);
  },

  async delete(req: Request, res: Response) {
    const id = getParam(req.params['id']);
    await clientPortalsService.delete(id);
    res.status(204).send();
  },

  async resendInvite(req: Request, res: Response) {
    try {
      const id = getParam(req.params['id']);
      const result = await clientPortalsService.resendInvite(id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to resend invite' });
    }
  },

  async verifyPortalToken(req: Request, res: Response) {
    try {
      const token = getParam(req.params['token']);
      const result = await clientPortalsService.verifyPortalToken(token);
      if (!result.valid) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err.message || 'Token verification failed' });
    }
  },

  async clientLogin(req: Request, res: Response) {
    try {
      const { username, password, portalToken } = clientLoginSchema.parse(req.body);
      const session = await clientPortalsService.clientLogin({
        username: username || undefined,
        passwordPlain: password,
        portalToken: portalToken || undefined,
      });
      res.json(session);
    } catch (err: any) {
      const msg = err.message || 'Invalid credentials';
      if (
        msg.includes('Invalid') ||
        msg.includes('inactive') ||
        msg.includes('Administrator')
      ) {
        res.status(401).json({ error: msg });
        return;
      }
      res.status(400).json({ error: msg });
    }
  },
};
