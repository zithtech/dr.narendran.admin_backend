import {z} from 'zod';

import {USER_ROLES} from './users.types.js';

/**
 * Request schemas for the users routes.
 *
 * These are the single source of truth for what the API accepts: the route
 * wires them in, the handler infers its input type from them, and the README
 * does not have to describe them separately.
 */

/** Postgres would reject a malformed uuid with a 22P02; catching it here gives a cleaner 400. */
export const userIdParamSchema = z.object({
  id: z.uuid('Must be a valid user id.'),
});

/**
 * Emails are lowercased at the edge so the value stored matches the
 * `lower(email)` unique index, and `Alice@x.com` cannot register twice as
 * `alice@x.com`.
 */
const emailSchema = z
  .string()
  .max(254, 'Email address is too long.')
  /* Normalise BEFORE validating, not after. Validating first would reject
     "alice@example.com " outright - and mobile keyboards append a trailing
     space constantly, so that is a real user-facing failure, not a theoretical
     one. Lowercasing here is also what makes the stored value line up with the
     lower(email) unique index. */
  .transform(value => value.trim().toLowerCase())
  .pipe(z.email('Must be a valid email address.'));

/**
 * 12 characters minimum, which is a deliberate choice over the more common 8:
 * length dominates password strength far more than composition rules, and
 * argon2 removes any reason to cap it low. 128 is an upper bound so a
 * megabyte-long password cannot be used to burn CPU on hashing.
 */
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must be at most 128 characters.');

const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(200, 'Name is too long.');

/**
 * Public registration.
 *
 * `role` is deliberately ABSENT, not defaulted. `z.enum(USER_ROLES)
 * .default('patient')` would NOT have been safe: a Zod default only fills in a
 * MISSING key, so a client posting `{"role":"admin"}` supplies the key and
 * sails straight past the default. Every account created through this route is
 * a patient; promotion happens only through the admin-guarded PATCH.
 *
 * `strictObject` rejects unknown keys instead of silently stripping them, so
 * an attempt to set `role` here returns an explicit 400 rather than appearing
 * to succeed while being quietly ignored.
 */
export const createUserSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

export const updateUserSchema = z
  .strictObject({
    email: emailSchema.optional(),
    fullName: fullNameSchema.optional(),
    role: z.enum(USER_ROLES).optional(),
  })
  /* Reject `PATCH {}` outright rather than performing a no-op update and
     returning 200, which would hide a client bug. */
  .refine(data => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const updateProfileSchema = z.strictObject({
  fullName: z.string().min(1, 'Name is required'),
  qualifications: z.string().optional(),
  specialtyId: z.string().uuid().optional(),
  specialty: z.string().optional(),
  clinicName: z.string().optional(),
  clinicAddress: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  profileImageUrl: z.string().url().optional().or(z.literal('')),
  registrationNumber: z.string().optional(),
  experienceYears: z.coerce.number().optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  /* Capped at 100: without a ceiling, `?limit=1000000` is a trivial way to
     exhaust memory and blow past the statement timeout. */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
