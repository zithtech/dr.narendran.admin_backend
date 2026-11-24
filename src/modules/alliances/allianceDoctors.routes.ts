import { Router } from 'express';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { AllianceDoctorsController } from './allianceDoctors.controller.js';

export const allianceDoctorsRouter = Router();

allianceDoctorsRouter.use(requireAuth);

allianceDoctorsRouter.get(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.getAll,
);

allianceDoctorsRouter.get(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'read', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.getById,
);

allianceDoctorsRouter.post(
  '/',
  requirePermission('ALLIANCE_DOCTORS', 'create', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.create,
);

allianceDoctorsRouter.put(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.update,
);

allianceDoctorsRouter.patch(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'update', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.update,
);

allianceDoctorsRouter.delete(
  '/:id',
  requirePermission('ALLIANCE_DOCTORS', 'delete', ['DOCTORS', 'HOSPITALS']),
  AllianceDoctorsController.delete,
);

