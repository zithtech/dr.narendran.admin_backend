import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { handler } from '@/http/middleware/validate.js';
import * as controller from './inventory.controller.js';
import {
  adjustStockSchema,
  batchDispenseSchema,
  damagedStockSchema,
  dispenseStockSchema,
  queryAllHistorySchema,
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

// Reduce & Dispense Summary statistics
inventoryRouter.get(
  '/reduce-summary',
  requirePermission('INVENTORY', 'read'),
  ...handler({}, controller.getReduceSummary),
);

// Global Reduce / Dispense History ledger
inventoryRouter.get(
  '/dispenses',
  requirePermission('INVENTORY', 'read'),
  ...handler({ query: queryAllHistorySchema }, controller.getAllDispenseHistory),
);

// Direct Dispense / Reduce Stock
inventoryRouter.post(
  '/dispense',
  requirePermission('INVENTORY', 'update'),
  ...handler({ body: dispenseStockSchema }, controller.dispense),
);

// Batch Dispense / Reduce Stock for multiple items
inventoryRouter.post(
  '/batch-dispense',
  requirePermission('INVENTORY', 'update'),
  ...handler({ body: batchDispenseSchema }, controller.batchDispense),
);

// Stock Operations on specific variant
inventoryRouter.post(
  '/:id/dispense',
  requirePermission('INVENTORY', 'update'),
  ...handler({ params: paramIdSchema, body: dispenseStockSchema }, controller.dispense),
);

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
