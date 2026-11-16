import { Router } from 'express';

import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { LabServicesController } from './lab-services.controller.js';

export const labServicesRouter = Router();

labServicesRouter.get(
  '/',
  requirePermission('LAB_SERVICES', 'read', ['LABS', 'PRESCRIPTIONS']),
  LabServicesController.getAll,
);
labServicesRouter.post('/', requirePermission('LAB_SERVICES', 'create'), LabServicesController.create);
labServicesRouter.put('/:id', requirePermission('LAB_SERVICES', 'update'), LabServicesController.update);
labServicesRouter.delete('/:id', requirePermission('LAB_SERVICES', 'delete'), LabServicesController.delete);
