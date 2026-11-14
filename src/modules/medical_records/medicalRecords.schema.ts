import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const listMedicalRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  patientId: z.string().uuid().optional(),
  type: z.enum(['ALL', 'PRESCRIBED', 'EXTERNAL', 'all', 'prescribed', 'external']).optional().default('ALL'),
  uploadedBy: z.string().trim().optional(),
  fromDate: z.string().trim().regex(DATE_REGEX, 'Invalid fromDate format (YYYY-MM-DD)').optional(),
  toDate: z.string().trim().regex(DATE_REGEX, 'Invalid toDate format (YYYY-MM-DD)').optional(),
});

export type ListMedicalRecordsQuery = z.infer<typeof listMedicalRecordsQuerySchema>;

export const uploadMedicalRecordBodySchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  testName: z.string().trim().min(1, 'Test/Document name is required').max(255),
  reportDate: z.string().trim().regex(DATE_REGEX, 'Invalid reportDate format (YYYY-MM-DD)').optional(),
  notes: z.string().trim().optional(),
  prescriptionLabTestId: z
    .string()
    .uuid('Invalid prescription lab test ID')
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? undefined : val)),
  isExternal: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    }),
  allowDuplicate: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    }),
});

export type UploadMedicalRecordBody = z.infer<typeof uploadMedicalRecordBodySchema>;

export const updateMedicalRecordBodySchema = z.object({
  testName: z.string().trim().min(1).max(255).optional(),
  reportDate: z.string().trim().regex(DATE_REGEX, 'Invalid reportDate format (YYYY-MM-DD)').optional(),
  notes: z.string().trim().optional(),
});

export type UpdateMedicalRecordBody = z.infer<typeof updateMedicalRecordBodySchema>;
