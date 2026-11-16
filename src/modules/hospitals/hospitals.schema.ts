import { z } from 'zod';

export const hospitalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Hospital name is required')
    .min(2, 'Hospital name must be at least 2 characters')
    .max(150, 'Hospital name cannot exceed 150 characters')
    .regex(/^[a-zA-Z0-9\s.,'&-]+$/, 'Hospital name contains invalid characters'),
  phone: z
    .union([
      z
        .string()
        .trim()
        .refine((val) => !val || /^[0-9+\s-]*$/.test(val), {
          message: 'Phone number cannot contain letters or special characters',
        })
        .refine(
          (val) => {
            if (!val) return true;
            const d = val.replace(/\D/g, '');
            return d.length >= 7 && d.length <= 15;
          },
          {
            message: 'Phone number must be between 7 and 15 digits',
          },
        ),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  email: z
    .union([
      z
        .string()
        .trim()
        .email('Please enter a valid email address')
        .max(150, 'Email address cannot exceed 150 characters'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  address: z.string().optional().nullable(),
  address_line_1: z
    .union([
      z
        .string()
        .trim()
        .max(255, 'Address line 1 cannot exceed 255 characters')
        .regex(/^[a-zA-Z0-9\s,./#&-]*$/, 'Address line 1 contains invalid characters'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  address_line_2: z
    .union([
      z
        .string()
        .trim()
        .max(255, 'Address line 2 cannot exceed 255 characters')
        .regex(/^[a-zA-Z0-9\s,./#&-]*$/, 'Address line 2 contains invalid characters'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  city: z
    .union([
      z
        .string()
        .trim()
        .max(100, 'City cannot exceed 100 characters')
        .regex(/^[a-zA-Z\s-]*$/, 'City can only contain letters and spaces'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  state: z
    .union([
      z
        .string()
        .trim()
        .max(100, 'State cannot exceed 100 characters')
        .regex(/^[a-zA-Z\s-]*$/, 'State can only contain letters and spaces'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  pincode: z
    .union([
      z
        .string()
        .trim()
        .regex(/^[0-9]{5,10}$/, 'Pincode must be between 5 and 10 digits and contain only numbers'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type HospitalInput = z.infer<typeof hospitalSchema>;

