import { z } from 'zod';

export const doctorSchema = z.object({
  hospital_id: z.union([z.string().uuid('Invalid hospital ID'), z.literal(''), z.null()]).optional().nullable(),
  branch_id: z.union([z.string().uuid('Invalid branch ID'), z.literal(''), z.null()]).optional().nullable(),
  user_account_id: z.union([z.string().uuid('Invalid user account ID'), z.literal(''), z.null()]).optional().nullable(),
  name: z
    .string()
    .trim()
    .min(1, 'Doctor name is required')
    .min(2, 'Doctor name must be at least 2 characters')
    .max(100, 'Doctor name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s.-]+$/, 'Doctor name can only contain letters, spaces, hyphens, and periods'),
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
  specialization: z
    .union([
      z
        .string()
        .trim()
        .max(100, 'Specialization cannot exceed 100 characters')
        .regex(/^[a-zA-Z\s,()./&-]*$/, 'Specialization can only contain letters and standard punctuation'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  qualification: z
    .union([
      z
        .string()
        .trim()
        .max(100, 'Qualification cannot exceed 100 characters')
        .regex(/^[a-zA-Z\s.,/()-]*$/, 'Qualification can only contain letters and standard academic punctuation'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  medical_registration_number: z
    .union([
      z
        .string()
        .trim()
        .min(3, 'Registration number must be at least 3 characters')
        .max(50, 'Registration number cannot exceed 50 characters')
        .regex(/^[a-zA-Z0-9/-]*$/, 'Medical registration number can only contain letters, numbers, hyphens, and slashes'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .nullable(),
  clinic_address: z.string().optional().nullable(),
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
  years_of_experience: z
    .union([
      z.coerce
        .number()
        .int('Years of experience must be a whole number')
        .min(0, 'Years of experience cannot be negative')
        .max(70, 'Years of experience cannot exceed 70'),
      z.null(),
    ])
    .optional()
    .nullable(),
  profile_image_url: z
    .union([z.string().trim().max(2048, 'Profile image URL cannot exceed 2048 characters'), z.literal(''), z.null()])
    .optional()
    .nullable(),
  podcast_url: z
    .union([z.string().trim().max(255, 'Podcast link cannot exceed 255 characters'), z.literal(''), z.null()])
    .optional()
    .nullable(),
  gender: z
    .union([z.string().trim().max(20), z.literal(''), z.null()])
    .optional()
    .nullable(),
  is_active: z.boolean().optional().nullable(),
});

export type DoctorInput = z.infer<typeof doctorSchema>;
