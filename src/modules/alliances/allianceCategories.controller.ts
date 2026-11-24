import type { Request, Response } from 'express';
import { z } from 'zod';
import { allianceCategoriesRepository } from './allianceCategories.repository.js';
import { createAllianceCategorySchema, updateAllianceCategorySchema } from './allianceCategories.schema.js';

export const AllianceCategoriesController = {
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query['search'] as string | undefined;
      const status = req.query['status'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const { categories, total } = await allianceCategoriesRepository.getAll({
        search,
        status,
        limit,
        offset,
      });

      res.json({
        status: 'success',
        data: categories,
        total,
      });
    } catch (err: any) {
      console.error('AllianceCategoriesController.getAll error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance categories', details: err.message });
    }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Category ID is required' });
        return;
      }

      const category = await allianceCategoriesRepository.getById(id);
      if (!category) {
        res.status(404).json({ error: 'Alliance category not found' });
        return;
      }

      res.json({ status: 'success', data: category });
    } catch (err: any) {
      console.error('AllianceCategoriesController.getById error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance category', details: err.message });
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createAllianceCategorySchema.parse(req.body);
      const category = await allianceCategoriesRepository.create(parsed as any);
      res.status(201).json({ status: 'success', data: category });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceCategoriesController.create error:', err);
      res.status(500).json({ error: 'Failed to create alliance category' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Category ID is required' });
        return;
      }

      const parsed = updateAllianceCategorySchema.parse(req.body);
      const updated = await allianceCategoriesRepository.update(id, parsed as any);
      if (!updated) {
        res.status(404).json({ error: 'Alliance category not found' });
        return;
      }

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceCategoriesController.update error:', err);
      res.status(500).json({ error: 'Failed to update alliance category' });
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Category ID is required' });
        return;
      }

      const deleted = await allianceCategoriesRepository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Alliance category not found' });
        return;
      }

      res.json({ status: 'success', message: 'Alliance category deleted successfully' });
    } catch (err: any) {
      console.error('AllianceCategoriesController.delete error:', err);
      res.status(500).json({ error: 'Failed to delete alliance category', details: err.message });
    }
  },
};

