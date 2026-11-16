import type { Request, Response } from 'express';
import { z } from 'zod';

import { labSchema } from './labs.schema.js';
import { LabsService, labsService } from './labs.service.js';

export const LabsController = {
  /**
   * GET /api/labs/active or for doctor app
   * List all active diagnostic laboratories.
   */
  async listLabs(_req: Request, res: Response): Promise<void> {
    try {
      const labs = await LabsService.listActiveLabs();
      res.status(200).json({ status: 'success', data: labs });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch diagnostic laboratories',
        details: err?.message,
      });
    }
  },

  /**
   * GET /api/labs/recommendation?labTestId=...&testName=...
   * Recommends a matching lab for the prescribed test.
   */
  async getRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const labTestId = typeof req.query['labTestId'] === 'string' ? req.query['labTestId'] : undefined;
      const testName = typeof req.query['testName'] === 'string' ? req.query['testName'] : undefined;

      const recommendation = await LabsService.getLabRecommendation({
        labTestId,
        testName,
      });

      res.status(200).json({ status: 'success', data: recommendation });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to get lab recommendation',
        details: err?.message,
      });
    }
  },

  async getAll(req: Request, res: Response) {
    try {
      const labs = await labsService.getAllLabs();
      res.json(labs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch labs' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = labSchema.parse(req.body);
      const cleanData = {
        ...data,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        email: data.email || null,
        phone: data.phone || null,
        map_link: data.map_link || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        services: data.services || [],
      };
      const lab = await labsService.createLab(cleanData);
      res.status(201).json(lab);
    } catch (err: unknown) {
      console.error('Create Lab Error:', err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to create lab' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid lab ID' });
        return;
      }
      const data = labSchema.parse(req.body);
      const cleanData = {
        ...data,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        email: data.email || null,
        phone: data.phone || null,
        map_link: data.map_link || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        services: data.services || [],
      };
      const lab = await labsService.updateLab({ id, ...cleanData });
      if (!lab) {
        res.status(404).json({ error: 'Lab not found' });
        return;
      }
      res.json(lab);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to update lab' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid lab ID' });
        return;
      }
      const success = await labsService.deleteLab(id);
      if (!success) {
        res.status(404).json({ error: 'Lab not found' });
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to delete lab' });
    }
  },
};
