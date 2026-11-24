import { z } from 'zod';

export const createAllianceCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category Name is required').max(150),
  description: z.string().trim().optional().nullable(),
  status: z.union([z.literal('ACTIVE'), z.literal('INACTIVE'), z.string()]).default('ACTIVE'),
}).passthrough();

export const updateAllianceCategorySchema = createAllianceCategorySchema.partial();

