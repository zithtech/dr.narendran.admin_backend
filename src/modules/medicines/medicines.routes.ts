import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import { handler } from '@/http/middleware/validate.js';

import { createMedicineStrengthSchema } from '../medicine_strengths/medicine_strengths.schema.js';
import * as strengthService from '../medicine_strengths/medicine_strengths.service.js';
import * as controller from './medicines.controller.js';
import {
  aiSearchMedicineSchema,
  bulkImportSchema,
  bulkValidateSchema,
  createMedicineSchema,
  listMedicinesSchema,
  updateMedicineSchema,
  createPackageSchema,
  updatePackageSchema,
} from './medicines.schema.js';

export const medicinesRouter: Router = Router();

const paramIdSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID'),
});

medicinesRouter.get(
  '/',
  requirePermission('PHARMACY', 'read', ['INVENTORY', 'MEDICINE_PACKAGES', 'PRESCRIPTIONS']),
  ...handler({ query: listMedicinesSchema }, controller.listMedicines)
);

medicinesRouter.post(
  '/ai-search',
  requirePermission('PHARMACY', 'read', ['PRESCRIPTIONS', 'INVENTORY']),
  ...handler({ body: aiSearchMedicineSchema }, controller.aiSearchMedicines)
);

medicinesRouter.post(
  '/bulk-validate',
  requirePermission('PHARMACY', 'create'),
  ...handler({ body: bulkValidateSchema }, controller.bulkValidate)
);

medicinesRouter.post(
  '/bulk-import',
  requirePermission('PHARMACY', 'create'),
  ...handler({ body: bulkImportSchema }, controller.bulkImport)
);

// Package routes
medicinesRouter.get(
  '/packages/all',
  requireAuth,
  requirePermission('MEDICINE_PACKAGES', 'read', ['PRESCRIPTIONS']),
  controller.listPackages
);

medicinesRouter.get(
  '/packages/:id',
  requireAuth,
  requirePermission('MEDICINE_PACKAGES', 'read', ['PRESCRIPTIONS']),
  ...handler({ params: paramIdSchema }, controller.getPackageById)
);

medicinesRouter.post(
  '/packages',
  requireAuth,
  requirePermission('MEDICINE_PACKAGES', 'create'),
  ...handler({ body: createPackageSchema }, controller.createPackage)
);

medicinesRouter.put(
  '/packages/:id',
  requireAuth,
  requirePermission('MEDICINE_PACKAGES', 'update'),
  ...handler({ params: paramIdSchema, body: updatePackageSchema }, controller.updatePackage)
);

medicinesRouter.delete(
  '/packages/:id',
  requireAuth,
  requirePermission('MEDICINE_PACKAGES', 'delete'),
  ...handler({ params: paramIdSchema }, controller.deletePackage)
);

medicinesRouter.get(
  '/:id',
  requirePermission('PHARMACY', 'read', ['INVENTORY', 'MEDICINE_PACKAGES', 'PRESCRIPTIONS']),
  ...handler({ params: paramIdSchema }, controller.getMedicineById)
);

medicinesRouter.post(
  '/',
  requirePermission('PHARMACY', 'create', ['PRESCRIPTIONS']),
  ...handler({ body: createMedicineSchema }, controller.createMedicine)
);

medicinesRouter.put(
  '/:id',
  requirePermission('PHARMACY', 'update'),
  ...handler({ params: paramIdSchema, body: updateMedicineSchema }, controller.updateMedicine)
);

medicinesRouter.delete(
  '/:id',
  requirePermission('PHARMACY', 'delete'),
  ...handler({ params: paramIdSchema }, controller.deleteMedicine)
);

// Nested strength variant routes for a medicine
medicinesRouter.get(
  '/:id/strengths',
  requireAuth,
  requirePermission('PHARMACY', 'read', ['INVENTORY']),
  ...handler({ params: paramIdSchema }, async (input, _req, res) => {
    const list = await strengthService.getByMedicineId(input.params.id);
    res.status(200).json({ success: true, data: list });
  })
);

medicinesRouter.post(
  '/:id/strengths',
  requireAuth,
  requirePermission('PHARMACY', 'create', ['INVENTORY']),
  ...handler(
    {
      params: paramIdSchema,
      body: createMedicineStrengthSchema.omit({ medicineId: true }),
    },
    async (input, _req, res) => {
      const created = await strengthService.createVariant({
        ...input.body,
        medicineId: input.params.id,
      });
      res.status(201).json({ success: true, data: created });
    }
  )
);
