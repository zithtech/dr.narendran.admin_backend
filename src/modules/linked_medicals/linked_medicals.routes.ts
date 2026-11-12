import { Router } from 'express';

import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { linkedMedicalsController } from './linked_medicals.controller.js';

export const linkedMedicalsRouter = Router();

linkedMedicalsRouter.get('/', requirePermission('LINKED_MEDICALS', 'read'), linkedMedicalsController.getAll);
linkedMedicalsRouter.post('/', requirePermission('LINKED_MEDICALS', 'create'), linkedMedicalsController.create);
linkedMedicalsRouter.put('/:id', requirePermission('LINKED_MEDICALS', 'update'), linkedMedicalsController.update);
linkedMedicalsRouter.delete('/:id', requirePermission('LINKED_MEDICALS', 'delete'), linkedMedicalsController.delete);
