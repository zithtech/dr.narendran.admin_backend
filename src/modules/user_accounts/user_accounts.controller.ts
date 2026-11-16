import type {Request, Response} from 'express';
import {z} from 'zod';

import {
  createUserAccountSchema,
  updateUserAccountSchema,
  userAccountParamIdSchema,
} from './user_accounts.schema.js';
import {userAccountsService} from './user_accounts.service.js';

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
      const data = createUserAccountSchema.parse(req.body);
      const userAccount = await userAccountsService.createUserAccount(data);
      res.status(201).json(userAccount);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message, errors: err.issues});
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
      const paramResult = userAccountParamIdSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({error: paramResult.error.issues[0]?.message || 'Invalid user account ID'});
        return;
      }
      const data = updateUserAccountSchema.parse(req.body);
      const userAccount = await userAccountsService.updateUserAccount({
        id: paramResult.data.id,
        ...data,
      });
      if (!userAccount) {
        res.status(404).json({error: 'User account not found'});
        return;
      }
      res.json(userAccount);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message, errors: err.issues});
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
      const paramResult = userAccountParamIdSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({error: paramResult.error.issues[0]?.message || 'Invalid user account ID'});
        return;
      }
      const success = await userAccountsService.deleteUserAccount(paramResult.data.id);
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
