import type {Request, Response} from 'express';
import {z} from 'zod';

import {doctorAvailabilityService} from './doctor_availability.service.js';

const availabilitySchema = z.object({
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  day_of_week: z.enum([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ]),
  start_time: z
    .string()
    .regex(
      /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/,
      'Invalid time format',
    ),
  end_time: z
    .string()
    .regex(
      /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/,
      'Invalid time format',
    ),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const DoctorAvailabilityController = {
  async getByDoctor(req: Request, res: Response) {
    try {
      const doctorId = String(req.params['doctorId']);
      if (!doctorId) {
        res.status(400).json({error: 'Invalid doctor ID'});
        return;
      }
      const availabilities =
        await doctorAvailabilityService.getAvailabilityByDoctor(doctorId);
      res.json(availabilities);
    } catch (err: any) {
      res.status(500).json({error: 'Failed to fetch doctor availability'});
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = availabilitySchema.parse(req.body);
      // Ensure times are formatted properly for postgres time (e.g. 09:00 -> 09:00:00)
      if (data.start_time.length === 5) data.start_time += ':00';
      if (data.end_time.length === 5) data.end_time += ':00';

      const availability =
        await doctorAvailabilityService.createAvailability(data);
      res.status(201).json(availability);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      res.status(500).json({error: 'Failed to create availability'});
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid availability ID'});
        return;
      }
      const data = availabilitySchema.parse(req.body);
      if (data.start_time.length === 5) data.start_time += ':00';
      if (data.end_time.length === 5) data.end_time += ':00';

      const availability = await doctorAvailabilityService.updateAvailability(
        id,
        data,
      );
      if (!availability) {
        res.status(404).json({error: 'Availability not found'});
        return;
      }
      res.json(availability);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      res.status(500).json({error: 'Failed to update availability'});
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid availability ID'});
        return;
      }
      const success = await doctorAvailabilityService.deleteAvailability(id);
      if (!success) {
        res.status(404).json({error: 'Availability not found'});
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({error: 'Failed to delete availability'});
    }
  },
};
