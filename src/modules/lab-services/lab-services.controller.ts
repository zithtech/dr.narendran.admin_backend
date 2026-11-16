import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createLabServiceSchema,
  labServiceParamIdSchema,
  updateLabServiceSchema,
} from './lab-services.schema.js';
import { labServicesService } from './lab-services.service.js';

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
      const data = createLabServiceSchema.parse(req.body);
      const service = await labServicesService.createService(data);
      res.status(201).json(service);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message, errors: err.issues });
        return;
      }
      res.status(500).json({ error: 'Failed to create lab service' });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const paramResult = labServiceParamIdSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: paramResult.error.issues[0]?.message || 'Invalid service ID' });
        return;
      }
      const data = updateLabServiceSchema.parse(req.body);
      const service = await labServicesService.updateService({ id: paramResult.data.id, ...data });
      if (!service) {
        res.status(404).json({ error: 'Lab service not found' });
        return;
      }
      res.json(service);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0].message, errors: err.issues });
        return;
      }
      res.status(500).json({ error: 'Failed to update lab service' });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const paramResult = labServiceParamIdSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: paramResult.error.issues[0]?.message || 'Invalid service ID' });
        return;
      }
      const success = await labServicesService.deleteService(paramResult.data.id);
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
