import type { Request, Response } from 'express';
import { z } from 'zod';
import { linkedMedicalsService } from './linked_medicals.service.js';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  address_line_1: z.string().optional().nullable(),
  address_line_2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  map_link: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  start_time: z.string().optional().nullable().or(z.literal('')),
  end_time: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const linkedMedicalsController = {
  async getAll(req: Request, res: Response) {
    const data = await linkedMedicalsService.getAll();
    res.json(data);
  },

  async create(req: Request, res: Response) {
    try {
      const data = schema.parse(req.body);
      const cleanData = {
        ...data,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        phone: data.phone || null,
        email: data.email || null,
        map_link: data.map_link || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
      };
      const result = await linkedMedicalsService.create(cleanData);
      res.status(201).json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message || 'Validation error' });
        return;
      }
      res.status(500).json({ error: 'Failed to create linked medical' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const data = schema.parse(req.body);
      const cleanData = {
        ...data,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        phone: data.phone || null,
        email: data.email || null,
        map_link: data.map_link || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
      };
      const id = String(req.params['id']);
      const result = await linkedMedicalsService.update(id, cleanData);
      if (!result) {
        res.status(404).json({ error: 'Linked medical not found' });
        return;
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message || 'Validation error' });
        return;
      }
      res.status(500).json({ error: 'Failed to update linked medical' });
    }
  },

  async delete(req: Request, res: Response) {
    const id = String(req.params['id']);
    const success = await linkedMedicalsService.delete(id);
    if (!success) {
      res.status(404).json({ error: 'Linked medical not found' });
      return;
    }
    res.status(204).send();
  }
};
