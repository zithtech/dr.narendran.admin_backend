import { z } from 'zod';

export const branchPhoneSchema = z
  .string()
  .trim()
  .transform((val) => (val === '' ? null : val))
  .nullable()
  .optional()
  .refine(
    (val) => {
      if (!val) return true;
      const digits = val.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    },
    { message: 'Phone number must be between 7 and 15 digits' },
  )
  .refine(
    (val) => {
      if (!val) return true;
      return /^\+?[0-9\s-]+$/.test(val) && !/[a-zA-Z]/.test(val);
    },
    { message: 'Phone number can only contain digits, spaces, hyphens, and an optional leading +' },
  );

export const branchSchema = z.object({
  hospital_id: z.string().uuid('Please select a valid parent hospital'),
  name: z
    .string()
    .trim()
    .min(2, 'Branch name must be at least 2 characters')
    .max(150, 'Branch name cannot exceed 150 characters')
    .regex(/^[a-zA-Z0-9\s.,'&-]+$/, 'Branch name contains invalid characters'),
  phone: branchPhoneSchema,
  address: z.string().trim().max(500, 'Address cannot exceed 500 characters').nullable().optional(),
  address_line_1: z
    .string()
    .trim()
    .max(255, 'Address line 1 cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s,./#&-]*$/, 'Address line 1 contains invalid characters')
    .nullable()
    .optional(),
  address_line_2: z
    .string()
    .trim()
    .max(255, 'Address line 2 cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s,./#&-]*$/, 'Address line 2 contains invalid characters')
    .nullable()
    .optional(),
  city: z
    .string()
    .trim()
    .max(100, 'City cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s-]*$/, 'City can only contain letters, spaces, and hyphens')
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .max(100, 'State cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s-]*$/, 'State can only contain letters, spaces, and hyphens')
    .nullable()
    .optional(),
  pincode: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true;
        return /^[0-9]{5,10}$/.test(val);
      },
      { message: 'Pincode must be between 5 and 10 numeric digits' },
    ),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type BranchInput = z.infer<typeof branchSchema>;

