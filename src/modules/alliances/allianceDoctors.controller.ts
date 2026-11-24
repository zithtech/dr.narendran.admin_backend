import type { Request, Response } from 'express';
import { z } from 'zod';
import { allianceDoctorsRepository } from './allianceDoctors.repository.js';
import { createAllianceDoctorSchema, updateAllianceDoctorSchema } from './allianceDoctors.schema.js';

export const AllianceDoctorsController = {
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query['search'] as string | undefined;
      const category = req.query['category'] as string | undefined;
      const specialization = req.query['specialization'] as string | undefined;
      const status = req.query['status'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined;

      const { doctors, total } = await allianceDoctorsRepository.getAll({
        search,
        category,
        specialization,
        status,
        limit,
        offset,
      });

      res.json({
        status: 'success',
        data: doctors,
        total,
      });
    } catch (err: any) {
      console.error('AllianceDoctorsController.getAll error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance doctors', details: err.message });
    }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Alliance doctor ID is required' });
        return;
      }

      const doctor = await allianceDoctorsRepository.getById(id);
      if (!doctor) {
        res.status(404).json({ error: 'Alliance doctor not found' });
        return;
      }

      res.json({ status: 'success', data: doctor });
    } catch (err: any) {
      console.error('AllianceDoctorsController.getById error:', err);
      res.status(500).json({ error: 'Failed to fetch alliance doctor details', details: err.message });
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createAllianceDoctorSchema.parse(req.body);
      const doctor = await allianceDoctorsRepository.create(parsed as any);
      res.status(201).json({ status: 'success', data: doctor });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceDoctorsController.create error:', err);
      res.status(500).json({ error: 'Failed to create alliance doctor' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Alliance doctor ID is required' });
        return;
      }

      const parsed = updateAllianceDoctorSchema.parse(req.body);
      const updated = await allianceDoctorsRepository.update(id, parsed as any);
      if (!updated) {
        res.status(404).json({ error: 'Alliance doctor not found' });
        return;
      }

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        res.status(400).json({ error: issue ? issue.message : 'Validation error', details: err.issues });
        return;
      }
      console.error('AllianceDoctorsController.update error:', err);
      res.status(500).json({ error: 'Failed to update alliance doctor' });
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({ error: 'Alliance doctor ID is required' });
        return;
      }

      const deleted = await allianceDoctorsRepository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'Alliance doctor not found' });
        return;
      }

      res.json({ status: 'success', message: 'Alliance doctor deleted successfully' });
    } catch (err: any) {
      console.error('AllianceDoctorsController.delete error:', err);
      res.status(500).json({ error: 'Failed to delete alliance doctor' });
    }
  },
};

