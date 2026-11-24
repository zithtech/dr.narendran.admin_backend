import { z } from 'zod';

export const createAllianceDoctorSchema = z.object({
  name: z.string().trim().min(1, 'Doctor Name is required').max(255),
  category: z.string().trim().max(150).optional().nullable(),
  specialization: z.string().trim().max(150).optional().nullable(),
  qualification: z.string().trim().max(255).optional().nullable(),
  experience_years: z.union([z.null(), z.coerce.number().int().min(0), z.string()]).optional().nullable(),
  gender: z.string().trim().max(50).optional().nullable(),
  mobile_number: z.string().trim().max(50).optional().nullable(),
  alternate_mobile_number: z.string().trim().max(50).optional().nullable(),
  email: z.union([z.string().trim().email('Invalid email address'), z.literal(''), z.null()]).optional().nullable(),
  address_line_1: z.string().trim().max(255).optional().nullable(),
  address_line_2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  pincode: z.string().trim().max(20).optional().nullable(),
  hospital_clinic_name: z.string().trim().max(255).optional().nullable(),
  registration_number: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  status: z.union([z.literal('ACTIVE'), z.literal('INACTIVE'), z.string()]).default('ACTIVE'),
}).passthrough();

export const updateAllianceDoctorSchema = createAllianceDoctorSchema.partial();

