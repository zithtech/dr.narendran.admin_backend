import type {Request, Response} from 'express';
import {z} from 'zod';

import {userAccountsService} from './user_accounts.service.js';

const userAccountSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().optional().nullable(),
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const UserAccountsController = {
  async getAll(req: Request, res: Response) {
    try {
      const userAccounts = await userAccountsService.getAllUserAccounts();
      res.json(userAccounts);
    } catch (err: any) {
      res.status(500).json({error: 'Failed to fetch user accounts'});
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = userAccountSchema.parse(req.body);
      if (!data.password) {
        res.status(400).json({
          error: 'Password is required when creating a new user account',
        });
        return;
      }
      const userAccount = await userAccountsService.createUserAccount(data);
      res.status(201).json(userAccount);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      // Check for unique constraint violation on username
      if ((err as any).code === '23505') {
        res.status(400).json({error: 'Username already exists'});
        return;
      }
      res.status(500).json({error: 'Failed to create user account'});
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid user account ID'});
        return;
      }
      const data = userAccountSchema.parse(req.body);
      const userAccount = await userAccountsService.updateUserAccount({
        id,
        ...data,
      });
      if (!userAccount) {
        res.status(404).json({error: 'User account not found'});
        return;
      }
      res.json(userAccount);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      if ((err as any).code === '23505') {
        res.status(400).json({error: 'Username already exists'});
        return;
      }
      res.status(500).json({error: 'Failed to update user account'});
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid user account ID'});
        return;
      }
      const success = await userAccountsService.deleteUserAccount(id);
      if (!success) {
        res.status(404).json({error: 'User account not found'});
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({error: 'Failed to delete user account'});
    }
  },
};
