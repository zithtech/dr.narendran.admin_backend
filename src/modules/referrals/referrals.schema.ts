import { z } from 'zod';

export const referralPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine(
    (val) => {
      const digits = val.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    },
    { message: 'Phone number must be between 7 and 15 digits' },
  )
  .refine(
    (val) => /^\+?[0-9\s-]+$/.test(val) && !/[a-zA-Z]/.test(val),
    { message: 'Phone number can only contain digits, spaces, hyphens, and an optional leading +' },
  );

export const referralEmailSchema = z
  .string()
  .trim()
  .transform((val) => (val === '' ? null : val))
  .nullable()
  .optional()
  .refine(
    (val) => {
      if (!val) return true;
      return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(val);
    },
    { message: 'Please enter a valid email address' },
  );

export const referralSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(150, 'Full name cannot exceed 150 characters'),
  phone: referralPhoneSchema,
  email: referralEmailSchema,
  gender: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional(),
  occupation: z
    .string()
    .trim()
    .max(150)
    .nullable()
    .optional(),
  profile_image_url: z
    .string()
    .trim()
    .nullable()
    .optional(),
  address_line_1: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),
  address_line_2: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),
  city: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),
  pincode: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: z
    .string()
    .trim()
    .nullable()
    .optional(),
});

export type ReferralInput = z.infer<typeof referralSchema>;
