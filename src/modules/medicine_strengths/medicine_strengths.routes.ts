import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
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
  ...handler({ query: queryMedicineStrengthsSchema }, controller.listVariants)
);

medicineStrengthsRouter.post(
  '/',
  requireRole('admin', 'doctor'),
  ...handler({ body: createMedicineStrengthSchema }, controller.createVariant)
);

medicineStrengthsRouter.get('/:id', controller.getById);

medicineStrengthsRouter.put(
  '/:id',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: updateMedicineStrengthSchema }, controller.updateVariant)
);

medicineStrengthsRouter.delete(
  '/:id',
  requireRole('admin'),
  controller.deleteVariant
);

export default medicineStrengthsRouter;
