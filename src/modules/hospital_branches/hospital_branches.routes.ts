import { createApiRouter, requirePermission } from '@/shared/index.js';

import { HospitalBranchesController } from './hospital_branches.controller.js';

export const hospitalBranchesRouter = createApiRouter();

hospitalBranchesRouter.get(
  '/',
  requirePermission('BRANCHES', 'read', ['DOCTORS', 'AVAILABILITY', 'APPOINTMENTS', 'TODAYS_SCHEDULE', 'STAFF']),
  HospitalBranchesController.getAll,
);
hospitalBranchesRouter.post('/', requirePermission('BRANCHES', 'create'), HospitalBranchesController.create);
hospitalBranchesRouter.put('/:id', requirePermission('BRANCHES', 'update'), HospitalBranchesController.update);
hospitalBranchesRouter.delete('/:id', requirePermission('BRANCHES', 'delete'), HospitalBranchesController.delete);
