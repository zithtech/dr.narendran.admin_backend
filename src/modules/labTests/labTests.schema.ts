import { z } from 'zod';

export const createLabTestSchema = z.strictObject({
  name: z.string().min(1, 'Lab Test name is required'),
  testType: z.string().min(1, 'Test type is required'),
  description: z.string().optional(),
  price: z.coerce.number().optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export const updateLabTestSchema = createLabTestSchema.partial().refine(
  data => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' }
);

export const listLabTestsSchema = z.object({
  search: z.string().optional(),
  testType: z.string().optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateLabTestInput = z.output<typeof createLabTestSchema>;
export type UpdateLabTestInput = z.output<typeof updateLabTestSchema>;
export type ListLabTestsQuery = z.output<typeof listLabTestsSchema>;
