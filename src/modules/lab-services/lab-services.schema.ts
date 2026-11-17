import { z } from 'zod';

export const labServiceNameSchema = z
  .string()
  .trim()
  .min(2, 'Diagnostic service name must be at least 2 characters')
  .max(150, 'Diagnostic service name cannot exceed 150 characters')
  .regex(/^[a-zA-Z0-9\s.,/+\-&()'%]+$/, 'Diagnostic service name contains invalid characters');

export const labServiceStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const labServiceDescriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description cannot exceed 1000 characters')
  .nullable()
  .optional();

export const labServicePriceSchema = z.coerce
  .number()
  .min(0, 'Price cannot be negative')
  .max(999999.99, 'Price cannot exceed 999,999.99')
  .nullable()
  .optional();

export const createLabServiceSchema = z.object({
  name: labServiceNameSchema,
  status: labServiceStatusSchema.default('ACTIVE'),
  service_code: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  service_category: z.string().trim().max(100).nullable().optional(),
  sample_type: z.string().trim().max(100).nullable().optional(),
  description: labServiceDescriptionSchema,
  price: labServicePriceSchema,
  service_price: labServicePriceSchema,
});

export const updateLabServiceSchema = z.object({
  name: labServiceNameSchema,
  status: labServiceStatusSchema,
  service_code: z.string().trim().max(100).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  service_category: z.string().trim().max(100).nullable().optional(),
  sample_type: z.string().trim().max(100).nullable().optional(),
  description: labServiceDescriptionSchema,
  price: labServicePriceSchema,
  service_price: labServicePriceSchema,
});

export const labServiceParamIdSchema = z.object({
  id: z.string().uuid('Invalid service ID'),
});

export type CreateLabServiceInput = z.infer<typeof createLabServiceSchema>;
export type UpdateLabServiceInput = z.infer<typeof updateLabServiceSchema>;

