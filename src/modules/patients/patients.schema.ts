import { z } from 'zod';

export const patientSchema = z.object({
  patient_id: z.string().trim().optional().nullable(),
  user_account_id: z.union([z.string().uuid('Invalid user account ID'), z.literal(''), z.null()]).optional().nullable(),
  hospital_id: z.string().uuid('Invalid hospital ID'),
  branch_id: z.union([z.string().uuid('Invalid branch ID'), z.literal(''), z.null()]).optional().nullable(),
  name: z
    .string()
    .trim()
    .min(1, 'Patient name is required')
    .min(2, 'Patient name must be at least 2 characters')
    .max(100, 'Patient name cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s._\-()]+$/, 'Patient name can only contain letters, spaces, hyphens, and periods'),
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
  date_of_birth: z.union([z.string().trim(), z.literal(''), z.null()]).optional().nullable(),
  gender: z.union([z.string().trim(), z.literal(''), z.null()]).optional().nullable(),
  occupation: z.union([z.string().trim().max(150, 'Occupation cannot exceed 150 characters'), z.literal(''), z.null()]).optional().nullable(),
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
  height_cm: z.union([
    z.coerce.number().min(20, 'Height must be at least 20 cm').max(300, 'Height cannot exceed 300 cm'),
    z.null(),
  ]).optional().nullable(),
  weight_kg: z.union([
    z.coerce.number().min(1, 'Weight must be at least 1 kg').max(500, 'Weight cannot exceed 500 kg'),
    z.null(),
  ]).optional().nullable(),
  blood_group: z.union([z.string().trim(), z.literal(''), z.null()]).optional().nullable(),
  blood_pressure: z.union([z.string().trim().max(50), z.literal(''), z.null()]).optional().nullable(),
  blood_sugar: z.union([z.string().trim().max(50), z.literal(''), z.null()]).optional().nullable(),
  body_temperature: z.union([z.string().trim().max(50), z.literal(''), z.null()]).optional().nullable(),
  custom_vitals: z.any().optional().nullable(),
  marital_status: z.union([z.string().trim(), z.literal(''), z.null()]).optional().nullable(),
  emergency_contacts: z.any().optional().nullable(),
  profile_image_url: z
    .union([z.string().trim().max(2048, 'Profile image URL cannot exceed 2048 characters'), z.literal(''), z.null()])
    .optional()
    .nullable(),
  is_active: z.boolean().optional().nullable(),
  referred_by: z.union([z.string().trim().max(50), z.literal(''), z.null()]).optional().nullable(),
  referral_id: z.union([z.string().trim().max(100), z.literal(''), z.null()]).optional().nullable(),
  referral_doctor_id: z.union([z.string().trim().max(100), z.literal(''), z.null()]).optional().nullable(),
});

export type PatientInput = z.infer<typeof patientSchema>;

