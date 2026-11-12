import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { handler } from '@/http/middleware/validate.js';
import * as controller from './medicine_strengths.controller.js';
import {
  createMedicineStrengthSchema,
  queryMedicineStrengthsSchema,
  updateMedicineStrengthSchema,
} from './medicine_strengths.schema.js';

export const medicineStrengthsRouter: Router = Router();

const paramIdSchema = z.object({
  id: z.string().uuid(),
});

medicineStrengthsRouter.use(requireAuth);

medicineStrengthsRouter.get(
  '/',
  requirePermission('INVENTORY', 'read', ['PHARMACY', 'MEDICINE_PACKAGES']),
  ...handler({ query: queryMedicineStrengthsSchema }, controller.listVariants)
);

medicineStrengthsRouter.post(
  '/',
  requirePermission('INVENTORY', 'create', ['PHARMACY']),
  ...handler({ body: createMedicineStrengthSchema }, controller.createVariant)
);

medicineStrengthsRouter.get(
  '/:id',
  requirePermission('INVENTORY', 'read', ['PHARMACY', 'MEDICINE_PACKAGES']),
  controller.getById,
);

medicineStrengthsRouter.put(
  '/:id',
  requirePermission('INVENTORY', 'update', ['PHARMACY']),
  ...handler({ params: paramIdSchema, body: updateMedicineStrengthSchema }, controller.updateVariant)
);

medicineStrengthsRouter.delete(
  '/:id',
  requirePermission('INVENTORY', 'delete', ['PHARMACY']),
  controller.deleteVariant
);

export default medicineStrengthsRouter;
