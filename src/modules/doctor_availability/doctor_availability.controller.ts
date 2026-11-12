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
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  slot_length: z.coerce.number().int().min(5).max(240).optional(),
});

export const DoctorAvailabilityController = {
  async getAll(req: Request, res: Response) {
    try {
      const doctorIdParam = req.query['doctorId'] || req.query['doctor_id'];
      const doctorId = doctorIdParam ? String(doctorIdParam) : undefined;
      const availabilities = await doctorAvailabilityService.getAllAvailabilities(doctorId);
      res.json(availabilities);
    } catch (err: unknown) {
      res.status(500).json({error: 'Failed to fetch doctor availabilities'});
    }
  },

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

  async updateDoctorSlotLength(req: Request, res: Response) {
    try {
      const doctorId = String(req.params['doctorId']);
      if (!doctorId) {
        res.status(400).json({error: 'Invalid doctor ID'});
        return;
      }
      const slotLength = Number(req.body['slot_length'] ?? req.body['slotLength']);
      if (!slotLength || isNaN(slotLength) || slotLength < 5 || slotLength > 240) {
        res.status(400).json({error: 'Slot length must be between 5 and 240 minutes'});
        return;
      }
      const updated = await doctorAvailabilityService.updateSlotLengthForDoctor(
        doctorId,
        slotLength,
      );
      res.json({
        success: true,
        message: `Updated slot duration to ${slotLength} minutes across all schedules`,
        count: updated.length,
        data: updated,
      });
    } catch (err: unknown) {
      res.status(500).json({error: 'Failed to update doctor slot duration'});
    }
  },

  async getBlockedDates(req: Request, res: Response) {
    try {
      const doctorId = String(req.params['doctorId'] || req.query['doctorId'] || '');
      if (!doctorId) {
        res.status(400).json({ error: 'Doctor ID is required' });
        return;
      }
      const data = await doctorAvailabilityService.getBlockedDatesByDoctor(doctorId);
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch doctor blocked dates' });
    }
  },

  async createBlockedDate(req: Request, res: Response) {
    try {
      const doctorId = String(req.params['doctorId'] || req.body['doctor_id'] || '');
      if (!doctorId) {
        res.status(400).json({ error: 'Doctor ID is required' });
        return;
      }

      // Pre-normalize blocked_date if format is DD-MM-YYYY or DD/MM/YYYY
      let rawBlockedDate = String(req.body?.['blocked_date'] || '').trim();
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(rawBlockedDate)) {
        const parts = rawBlockedDate.split(/[-/]/);
        rawBlockedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      const bodyToParse = {
        ...req.body,
        blocked_date: rawBlockedDate,
      };

      const parsed = z
        .object({
          blocked_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
          start_time: z.string().optional().default('00:00'),
          end_time: z.string().optional().default('23:59'),
          reason: z.string().optional().default(''),
          is_all_day: z.boolean().optional().default(false),
        })
        .parse(bodyToParse);

      const isAllDay =
        parsed.is_all_day ||
        (parsed.start_time <= '00:00' && parsed.end_time >= '23:59');
      const startTime = isAllDay ? '00:00:00' : parsed.start_time;
      const endTime = isAllDay ? '23:59:59' : parsed.end_time;

      const record = await doctorAvailabilityService.createBlockedDate({
        doctor_id: doctorId,
        blocked_date: parsed.blocked_date,
        start_time: startTime,
        end_time: endTime,
        reason: parsed.reason,
      });
      res.status(201).json(record);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: (err as any).issues[0]?.message || 'Validation error' });
        return;
      }
      console.error('Error creating blocked date:', err);
      res.status(500).json({ error: (err as any)?.message || 'Failed to create blocked date' });
    }
  },

  async updateBlockedDate(req: Request, res: Response) {
    try {
      const blockId = String(req.params['blockId'] || req.params['id'] || '');
      if (!blockId) {
        res.status(400).json({ error: 'Block ID is required' });
        return;
      }
      const parsed = z
        .object({
          blocked_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
            .optional(),
          start_time: z.string().optional(),
          end_time: z.string().optional(),
          reason: z.string().optional(),
          is_all_day: z.boolean().optional(),
        })
        .parse(req.body);

      let startTime = parsed.start_time;
      let endTime = parsed.end_time;
      if (parsed.is_all_day) {
        startTime = '00:00:00';
        endTime = '23:59:59';
      }

      const record = await doctorAvailabilityService.updateBlockedDate(blockId, {
        blocked_date: parsed.blocked_date,
        start_time: startTime,
        end_time: endTime,
        reason: parsed.reason,
      });
      if (!record) {
        res.status(404).json({ error: 'Blocked date record not found' });
        return;
      }
      res.json(record);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: (err as any).issues[0]?.message || 'Validation error' });
        return;
      }
      res.status(500).json({ error: 'Failed to update blocked date' });
    }
  },

  async deleteBlockedDate(req: Request, res: Response) {
    try {
      const blockId = String(req.params['blockId'] || req.params['id'] || '');
      if (!blockId) {
        res.status(400).json({ error: 'Block ID is required' });
        return;
      }
      const deleted = await doctorAvailabilityService.deleteBlockedDate(blockId);
      if (!deleted) {
        res.status(404).json({ error: 'Blocked date record not found' });
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to delete blocked date' });
    }
  },
};
