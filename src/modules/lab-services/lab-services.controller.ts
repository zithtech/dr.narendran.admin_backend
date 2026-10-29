import type { Request, Response } from 'express';
import { z } from 'zod';
import { labServicesService } from './lab-services.service.js';

const labServiceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const LabServicesController = {
  async getAll(req: Request, res: Response) {
    try {
      const services = await labServicesService.getAllServices();
      res.json(services);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch lab services' });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = labServiceSchema.parse(req.body);
      const service = await labServicesService.createService(data);
      res.status(201).json(service);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to create lab service' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid service ID' });
        return;
      }
      const data = labServiceSchema.parse(req.body);
      const service = await labServicesService.updateService({ id, ...data });
      if (!service) {
        res.status(404).json({ error: 'Lab service not found' });
        return;
      }
      res.json(service);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message });
        return;
      }
      res.status(500).json({ error: 'Failed to update lab service' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Invalid service ID' });
        return;
      }
      const success = await labServicesService.deleteService(id);
      if (!success) {
        res.status(404).json({ error: 'Lab service not found' });
        return;
      }
      res.json({ message: 'Lab service deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete lab service' });
    }
  },
};
