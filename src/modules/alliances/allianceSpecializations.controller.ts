import type { Request, Response } from 'express';
import { z } from 'zod';
import { allianceSpecializationsRepository } from './allianceSpecializations.repository.js';
import { createAllianceSpecializationSchema, updateAllianceSpecializationSchema } from './allianceSpecializations.schema.js';

export const AllianceSpecializationsController = {
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query['search'] as string | undefined;
      const status = req.query['status'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const { specializations, total } = await allianceSpecializationsRepository.getAll({
        search,
        status,
        limit,
        offset,
      });

      res.json({
        status: 'success',
        data: specializations,
        total,
      });
    } catch (err: any) {
      console.error('AllianceSpecializationsController.getAll error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance specializations', details: err.message });
    }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Specialization ID is required' });
        return;
      }

      const specialization = await allianceSpecializationsRepository.getById(id);
      if (!specialization) {
        res.status(404).json({ error: 'Alliance specialization not found' });
        return;
      }

      res.json({ status: 'success', data: specialization });
    } catch (err: any) {
      console.error('AllianceSpecializationsController.getById error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance specialization', details: err.message });
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createAllianceSpecializationSchema.parse(req.body);
      const specialization = await allianceSpecializationsRepository.create(parsed as any);
      res.status(201).json({ status: 'success', data: specialization });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceSpecializationsController.create error:', err);
      res.status(500).json({ error: 'Failed to create alliance specialization' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Specialization ID is required' });
        return;
      }

      const parsed = updateAllianceSpecializationSchema.parse(req.body);
      const updated = await allianceSpecializationsRepository.update(id, parsed as any);
      if (!updated) {
        res.status(404).json({ error: 'Alliance specialization not found' });
        return;
      }

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceSpecializationsController.update error:', err);
      res.status(500).json({ error: 'Failed to update alliance specialization' });
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Specialization ID is required' });
        return;
      }

      const deleted = await allianceSpecializationsRepository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Alliance specialization not found' });
        return;
      }

      res.json({ status: 'success', message: 'Alliance specialization deleted successfully' });
    } catch (err: any) {
      console.error('AllianceSpecializationsController.delete error:', err);
      res.status(500).json({ error: 'Failed to delete alliance specialization', details: err.message });
    }
  },
};

