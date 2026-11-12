import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { labPortalController } from '../lab_portal/lab_portal.controller.js';
import { LabsController } from './labs.controller.js';

export const labsRouter: Router = Router();

// Recommendation endpoint (for doctor prescription referral)
labsRouter.get('/recommendation', requireAuth, LabsController.getRecommendation);

// List active labs (for doctor app)
labsRouter.get('/active', requireAuth, LabsController.listLabs);

// Main GET endpoint: Admin app fetches all labs with portal accounts and services
labsRouter.get(
  '/',
  requirePermission('LABS', 'read', ['LAB_SERVICES', 'PRESCRIPTIONS']),
  (req, res) => {
    if (req.query['active'] === 'true') {
      return LabsController.listLabs(req, res);
    }
    return LabsController.getAll(req, res);
  },
);

// Admin CRUD routes
labsRouter.post('/', requirePermission('LABS', 'create'), LabsController.create);
labsRouter.put('/:id', requirePermission('LABS', 'update'), LabsController.update);
labsRouter.delete('/:id', requirePermission('LABS', 'delete'), LabsController.delete);

// Client Portal account management for labs
labsRouter.post(
  '/:id/portal-account',
  requirePermission('LABS', 'create', ['CLIENT_PORTALS']),
  labPortalController.createPortalAccount,
);
labsRouter.get(
  '/:id/portal-account',
  requirePermission('LABS', 'read', ['CLIENT_PORTALS']),
  labPortalController.getPortalAccount,
);
labsRouter.post(
  '/:id/portal-account/reset-password',
  requirePermission('LABS', 'update', ['CLIENT_PORTALS']),
  labPortalController.resetPortalPassword,
);
labsRouter.post(
  '/:id/portal-account/resend-invite',
  requirePermission('LABS', 'update', ['CLIENT_PORTALS']),
  labPortalController.resendPortalInvite,
);
