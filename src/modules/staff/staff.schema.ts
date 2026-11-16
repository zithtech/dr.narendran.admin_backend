import { z } from 'zod';

export const staffNameSchema = z
  .string()
  .trim()
  .min(2, 'Staff name must be at least 2 characters')
  .max(100, 'Staff name cannot exceed 100 characters')
  .regex(/^[a-zA-Z\s.'-]+$/, "Staff name can only contain letters, spaces, and punctuation (.' -)");

export const staffPhoneSchema = z
  .string()
  .trim()
  .refine((val) => !/[a-zA-Z]/.test(val), { message: 'Letters are not allowed in phone number' })
  .refine((val) => !/[^0-9+\s\-]/.test(val), { message: 'Special characters are not allowed in phone number' })
  .refine((val) => val.replace(/\D/g, '').length >= 10, { message: 'Phone number must contain at least 10 digits' })
  .refine((val) => val.replace(/\D/g, '').length <= 15, { message: 'Phone number cannot exceed 15 digits' });

export const staffEmailSchema = z
  .string()
  .trim()
  .optional()
  .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(val), {
    message: 'Please enter a valid email address (e.g. staff@hospital.com)',
  })
  .refine((val) => !val || val.length <= 150, {
    message: 'Email address cannot exceed 150 characters',
  });

export const staffRoleSchema = z
  .string()
  .trim()
  .min(1, 'Staff role is required')
  .max(60, 'Role title cannot exceed 60 characters');

export const staffJoiningDateSchema = z
  .string()
  .min(1, 'Date of joining is required')
  .refine((val) => !isNaN(new Date(val).getTime()), { message: 'Please select a valid date' })
  .refine((val) => {
    const year = new Date(val).getFullYear();
    return year >= 1970 && year <= 2099;
  }, { message: 'Please enter a valid year between 1970 and 2099' });

export const staffStatusSchema = z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE');

export const createStaffSchema = z.object({
  name: staffNameSchema,
  phone: staffPhoneSchema,
  email: staffEmailSchema,
  role: staffRoleSchema,
  hospitalId: z.string().uuid('Invalid hospital ID').optional().nullable(),
  branchId: z.string().uuid('Invalid branch ID').optional().nullable(),
  shiftTiming: z.string().optional().default('Morning'),
  customShiftDetails: z.string().optional(),
  workDays: z.array(z.string()).optional(),
  joiningDate: staffJoiningDateSchema.optional(),
  status: staffStatusSchema,
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  address: z.string().max(500).optional(),
  address_line_1: z.string().max(255).optional().nullable(),
  address_line_2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
});

export const updateStaffSchema = createStaffSchema.partial().omit({ status: true }).extend({
  status: staffStatusSchema.optional(),
});

export const staffParamIdSchema = z.object({
  id: z.string().uuid('Invalid staff ID'),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
