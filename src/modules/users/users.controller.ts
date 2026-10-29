import type { Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';
import type { ValidatedData } from '@/http/middleware/validate.js';

import type {
  createUserSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schema.js';
import * as usersService from './users.service.js';

/**
 * HTTP adapter for the users resource.
 *
 * Each function does exactly three things: read validated input, call ONE
 * service function, and shape the response. No SQL, no business rules, no
 * pool access - if logic starts appearing here it belongs in the service.
 */

type CreateInput = ValidatedData<{ body: typeof createUserSchema }>;
type GetInput = ValidatedData<{ params: typeof userIdParamSchema }>;
type ListInput = ValidatedData<{ query: typeof listUsersQuerySchema }>;
type UpdateInput = ValidatedData<{
  params: typeof userIdParamSchema;
  body: typeof updateUserSchema;
}>;
type UpdateProfileInput = ValidatedData<{ body: typeof updateProfileSchema }>;
type DeleteInput = ValidatedData<{ params: typeof userIdParamSchema }>;

export async function createUser(
  input: CreateInput,
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await usersService.createUser(input.body);
  /* 201 + Location is the correct answer for a created resource; the mobile
     clients ignore the header today but any HTTP-literate client will use it. */
  res.status(201).location(`/api/users/${user.id}`).json({ user });
}

export async function getUser(
  input: GetInput,
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await usersService.getUserById(input.params.id);
  res.status(200).json({ user });
}

export async function listUsers(
  input: ListInput,
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await usersService.listUsers(input.query);
  res.status(200).json({
    users: result.users,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
}

export async function updateUser(
  input: UpdateInput,
  req: Request,
  res: Response,
): Promise<void> {
  /* `requireAuth` runs before this handler, so req.user is always present.
     Asserting rather than silently defaulting: if it is ever missing, the
     route is misconfigured and we want that to fail loudly. */
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const user = await usersService.updateUser(input.params.id, input.body, {
    id: req.user.id,
    role: req.user.role,
  });
  res.status(200).json({ user });
}

export async function deleteUser(
  input: DeleteInput,
  _req: Request,
  res: Response,
): Promise<void> {
  await usersService.deleteUser(input.params.id);
  /* 204: the resource is gone, there is nothing meaningful to return. */
  res.status(204).send();
}

export async function getProfile(
  _req: Request,
  res: Response,
): Promise<void> {
  if (!_req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const profile = await usersService.getDoctorProfile(_req.user.id);
  res.status(200).json({ profile });
}

export async function updateProfile(
  input: UpdateProfileInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const profile = await usersService.updateDoctorProfile(
    req.user.id,
    input.body,
  );
  res.status(200).json({ profile });
}

export async function getSpecialties(
  _req: Request,
  res: Response,
): Promise<void> {
  const specialties = await usersService.getSpecialties();
  res.status(200).json({ specialties });
}
