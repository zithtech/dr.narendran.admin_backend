import { z } from 'zod';

export const createAllianceSpecializationSchema = z.object({
  name: z.string().trim().min(1, 'Specialization Name is required').max(150),
  description: z.string().trim().optional().nullable(),
  status: z.union([z.literal('ACTIVE'), z.literal('INACTIVE'), z.string()]).default('ACTIVE'),
}).passthrough();

export const updateAllianceSpecializationSchema = createAllianceSpecializationSchema.partial();

