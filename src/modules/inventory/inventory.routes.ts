import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/http/middleware/authenticate.js';
import { handler } from '@/http/middleware/validate.js';
import * as controller from './inventory.controller.js';
import {
  adjustStockSchema,
  damagedStockSchema,
  queryHistorySchema,
  returnStockSchema,
  stockInSchema,
  stockOutSchema,
} from './inventory.schema.js';

export const inventoryRouter: Router = Router();

const paramIdSchema = z.object({
  id: z.string().uuid(),
});

inventoryRouter.use(requireAuth);

// Summary statistics
inventoryRouter.get('/summary', ...handler({}, controller.getSummaryStats));

// Stock Operations on specific variant
inventoryRouter.post(
  '/:id/stock-in',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: stockInSchema }, controller.stockIn)
);

inventoryRouter.post(
  '/:id/stock-out',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: stockOutSchema }, controller.stockOut)
);

inventoryRouter.post(
  '/:id/adjust',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: adjustStockSchema }, controller.adjustStock)
);

inventoryRouter.post(
  '/:id/damaged',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: damagedStockSchema }, controller.damagedStock)
);

inventoryRouter.post(
  '/:id/return',
  requireRole('admin', 'doctor'),
  ...handler({ params: paramIdSchema, body: returnStockSchema }, controller.returnStock)
);

inventoryRouter.get(
  '/:id/history',
  ...handler({ params: paramIdSchema, query: queryHistorySchema }, controller.getStockHistory)
);

export default inventoryRouter;
