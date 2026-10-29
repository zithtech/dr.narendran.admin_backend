import { z } from 'zod';

/**
 * Login request schema.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .max(254)
    .transform(value => value.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required.').max(128),
});

/**
 * OTP send schema.
 */
export const sendOtpSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const phone = obj['phone'] ?? obj['mobileNumber'] ?? obj['phone'];
      return { ...obj, phone };
    }
    return val;
  },
  z.object({
    phone: z
      .string()
      .min(5, 'Mobile number is required.')
      .max(20)
      .transform(value => value.trim()),
    role: z.enum(['patient', 'doctor', 'admin']).optional(),
  }),
);

/**
 * OTP verify schema.
 */
export const verifyOtpSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const phone = obj['phone'] ?? obj['mobileNumber'] ?? obj['phone'];
      const code =
        obj['code'] ?? obj['otp'] ?? obj['verificationCode'] ?? obj['otpCode'];
      return { ...obj, phone, code };
    }
    return val;
  },
  z.object({
    phone: z
      .string()
      .min(5, 'Mobile number is required.')
      .max(20)
      .transform(value => value.trim()),
    code: z
      .string()
      .min(4, 'Code must be at least 4 characters.')
      .max(10)
      .transform(value => value.trim()),
    role: z.enum(['patient', 'doctor', 'admin']).optional(),
  }),
);

/**
 * Patient registration schema.
 */
export const registerPatientSchema = z.object({
  phone: z.string().min(5, 'Mobile number is required.'),
  verificationToken: z.string().optional(),
  profile: z.object({
    fullName: z.string().min(1, 'Full name is required.'),
    dob: z.string().optional(),
    gender: z
      .enum(['Female', 'Male', 'Other', 'female', 'male', 'other'])
      .optional(),
    email: z.string().optional(),
    heightCm: z.union([z.number(), z.string()]).optional(),
    height_cm: z.union([z.number(), z.string()]).optional(),
    weightKg: z.union([z.number(), z.string()]).optional(),
    weight_kg: z.union([z.number(), z.string()]).optional(),
    maritalStatus: z.string().optional(),
    marital_status: z.string().optional(),
    bloodGroup: z.string().optional(),
    blood_group: z.string().optional(),
  }),
  consents: z.object({
    records: z.boolean().refine(val => val === true, {
      message: 'Medical Records consent is required.',
    }),
    reminders: z.boolean().optional(),
    education: z.boolean().optional(),
  }),
});

export type LoginInput = z.output<typeof loginSchema>;
export type SendOtpInput = z.output<typeof sendOtpSchema>;
export type VerifyOtpInput = z.output<typeof verifyOtpSchema>;
export type VerifyMobileOtpInput = VerifyOtpInput;
export type RegisterPatientInput = z.output<typeof registerPatientSchema>;

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .min(10, 'Mobile number must be at least 10 digits.')
    .max(15)
    .transform(val => val.replace(/\D/g, '')),
  app: z.enum(['doctor', 'patient']).optional(),
});
export type RequestOtpInput = z.output<typeof requestOtpSchema>;

/**
 * Alias for backward compatibility
 */
export const verifyMobileOtpSchema = verifyOtpSchema;


