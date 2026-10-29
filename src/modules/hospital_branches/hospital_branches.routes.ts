import { createApiRouter } from '@/shared/index.js';

import { HospitalBranchesController } from './hospital_branches.controller.js';

export const hospitalBranchesRouter = createApiRouter();

hospitalBranchesRouter.get('/', HospitalBranchesController.getAll);
hospitalBranchesRouter.post('/', HospitalBranchesController.create);
hospitalBranchesRouter.put('/:id', HospitalBranchesController.update);
hospitalBranchesRouter.delete('/:id', HospitalBranchesController.delete);
