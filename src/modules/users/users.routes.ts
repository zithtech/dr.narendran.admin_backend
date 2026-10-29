import { Router } from 'express';

import {
  requireAuth,
  requireSelfOrRole,
} from '@/http/middleware/authenticate.js';
import { handler } from '@/http/middleware/validate.js';

import * as usersController from './users.controller.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schema.js';

/**
 * Users routes.
 *
 * Routes only bind a path to guards, a schema and a controller. No logic here.
 * Read top to bottom, each line states the full access policy for that route.
 */
export const usersRouter: Router = Router();

/* Public: this is registration. The schema has no `role` field and the service
   hardcodes 'patient', so an account cannot self-register with elevated
   privileges. Creating doctors/admins is an admin-only PATCH. */
usersRouter.post(
  '/',
  ...handler({ body: createUserSchema }, usersController.createUser),
);

/* Any authenticated user may browse the directory. Tighten to
   requireRole('admin', 'doctor') if patient records become listable here. */
usersRouter.get(
  '/',
  requireAuth,
  ...handler({ query: listUsersQuerySchema }, usersController.listUsers),
);

usersRouter.get('/me/profile', requireAuth, usersController.getProfile);
usersRouter.post(
  '/me/profile',
  requireAuth,
  ...handler({ body: updateProfileSchema }, usersController.updateProfile),
);
usersRouter.get('/specialties', usersController.getSpecialties);

usersRouter.get(
  '/:id',
  requireAuth,
  ...handler({ params: userIdParamSchema }, usersController.getUser),
);

// (moved above)

/* Self-service edit, or an admin editing anyone. The route guard answers
   "may you touch this record?"; the service additionally enforces that only an
   admin may change the `role` field, so a patient editing their own profile
   cannot escalate themselves to admin. */
usersRouter.patch(
  '/:id',
  requireAuth,
  requireSelfOrRole('id', 'admin'),
  ...handler(
    { params: userIdParamSchema, body: updateUserSchema },
    usersController.updateUser,
  ),
);

usersRouter.delete(
  '/:id',
  requireAuth,
  requireSelfOrRole('id', 'admin'),
  ...handler({ params: userIdParamSchema }, usersController.deleteUser),
);
