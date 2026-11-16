import { z } from 'zod';

export const userAccountUsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username cannot exceed 50 characters')
  .refine((val) => !/\s/.test(val), { message: 'Username cannot contain spaces' })
  .regex(/^[a-zA-Z][a-zA-Z0-9._\-@]*$/, 'Username must start with a letter and can only contain letters, numbers, dots, underscores, hyphens, and @');

export const userAccountPasswordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(100, 'Password cannot exceed 100 characters');

export const userAccountRoleSchema = z.enum(['ADMIN', 'DOCTOR', 'PATIENT']);

export const userAccountStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const createUserAccountSchema = z.object({
  username: userAccountUsernameSchema,
  password: userAccountPasswordSchema,
  role: userAccountRoleSchema,
  status: userAccountStatusSchema.default('ACTIVE'),
});

export const updateUserAccountSchema = z.object({
  username: userAccountUsernameSchema,
  password: userAccountPasswordSchema.nullable().optional().or(z.literal('')),
  role: userAccountRoleSchema,
  status: userAccountStatusSchema.default('ACTIVE'),
});

export const userAccountParamIdSchema = z.object({
  id: z.string().uuid('Invalid user account ID'),
});

export type CreateUserAccountInput = z.infer<typeof createUserAccountSchema>;
export type UpdateUserAccountInput = z.infer<typeof updateUserAccountSchema>;
