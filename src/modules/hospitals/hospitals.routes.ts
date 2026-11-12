import { createApiRouter, requirePermission } from '@/shared/index.js';

import { HospitalsController } from './hospitals.controller.js';

export const hospitalsRouter = createApiRouter();

hospitalsRouter.get(
  '/',
  requirePermission('HOSPITALS', 'read', ['BRANCHES', 'DOCTORS', 'STAFF']),
  HospitalsController.getAll,
);
hospitalsRouter.post('/', requirePermission('HOSPITALS', 'create'), HospitalsController.create);
hospitalsRouter.put('/:id', requirePermission('HOSPITALS', 'update'), HospitalsController.update);
hospitalsRouter.delete('/:id', requirePermission('HOSPITALS', 'delete'), HospitalsController.delete);
