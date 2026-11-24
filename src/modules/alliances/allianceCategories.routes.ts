import { Router } from 'express';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { AllianceCategoriesController } from './allianceCategories.controller.js';

export const allianceCategoriesRouter = Router();

allianceCategoriesRouter.use(requireAuth);

allianceCategoriesRouter.get(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.getAll,
);

allianceCategoriesRouter.get(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.getById,
);

allianceCategoriesRouter.post(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'create', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.create,
);

allianceCategoriesRouter.put(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.update,
);

allianceCategoriesRouter.patch(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.update,
);

allianceCategoriesRouter.delete(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'delete', ['DOCTORS', 'HOSPITALS']),
  AllianceCategoriesController.delete,
);

