import type { Request, Response } from 'express';
import { z } from 'zod';
import { referralSchema } from './referrals.schema.js';
import { referralsService } from './referrals.service.js';

export const referralsController = {
  async getAll(req: Request, res: Response) {
    try {
      const data = await referralsService.getAll();
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to fetch referrals' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      const data = await referralsService.getById(id);
      if (!data) {
        res.status(404).json({ error: 'Referral not found' });
        return;
      }
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to fetch referral' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = referralSchema.parse(req.body);
      const result = await referralsService.create(data);
      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message || 'Validation error' });
        return;
      }
      res.status(500).json({ error: 'Failed to create referral' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const data = referralSchema.parse(req.body);
      const id = String(req.params['id']);
      const result = await referralsService.update(id, data);
      if (!result) {
        res.status(404).json({ error: 'Referral not found' });
        return;
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message || 'Validation error' });
        return;
      }
      res.status(500).json({ error: 'Failed to update referral' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      const success = await referralsService.delete(id);
      if (!success) {
        res.status(404).json({ error: 'Referral not found' });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'Failed to delete referral' });
    }
  },
};
