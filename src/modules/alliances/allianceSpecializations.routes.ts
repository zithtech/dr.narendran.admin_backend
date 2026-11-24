import { Router } from 'express';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { AllianceSpecializationsController } from './allianceSpecializations.controller.js';

export const allianceSpecializationsRouter = Router();

allianceSpecializationsRouter.use(requireAuth);

allianceSpecializationsRouter.get(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.getAll,
);

allianceSpecializationsRouter.get(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.getById,
);

allianceSpecializationsRouter.post(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'create', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.create,
);

allianceSpecializationsRouter.put(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.update,
);

allianceSpecializationsRouter.patch(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.update,
);

allianceSpecializationsRouter.delete(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'delete', ['DOCTORS', 'HOSPITALS']),
  AllianceSpecializationsController.delete,
);

