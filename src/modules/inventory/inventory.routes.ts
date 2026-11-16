import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
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
inventoryRouter.get(
  '/summary',
  requirePermission('INVENTORY', 'read'),
  ...handler({}, controller.getSummaryStats),
);

// Stock Operations on specific variant
inventoryRouter.post(
  '/:id/stock-in',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: stockInSchema }, controller.stockIn)
);

inventoryRouter.post(
  '/:id/stock-out',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: stockOutSchema }, controller.stockOut)
);

inventoryRouter.post(
  '/:id/adjust',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: adjustStockSchema }, controller.adjustStock)
);

inventoryRouter.post(
  '/:id/damaged',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: damagedStockSchema }, controller.damagedStock)
);

inventoryRouter.post(
  '/:id/return',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: returnStockSchema }, controller.returnStock)
);

inventoryRouter.get(
  '/:id/history',
  requirePermission('INVENTORY', 'read'),
  ...handler({ params: paramIdSchema, query: queryHistorySchema }, controller.getStockHistory)
);

export default inventoryRouter;
