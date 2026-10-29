import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';

import { labPortalController } from '../lab_portal/lab_portal.controller.js';
import { LabsController } from './labs.controller.js';

export const labsRouter: Router = Router();

// Recommendation endpoint (for doctor prescription referral)
labsRouter.get('/recommendation', requireAuth, LabsController.getRecommendation);

// List active labs (for doctor app)
labsRouter.get('/active', requireAuth, LabsController.listLabs);

// Main GET endpoint: Admin app fetches all labs with portal accounts and services
labsRouter.get('/', (req, res) => {
  if (req.query['active'] === 'true') {
    return LabsController.listLabs(req, res);
  }
  return LabsController.getAll(req, res);
});

// Admin CRUD routes
labsRouter.post('/', LabsController.create);
labsRouter.put('/:id', LabsController.update);
labsRouter.delete('/:id', LabsController.delete);

// Client Portal account management for labs
labsRouter.post('/:id/portal-account', labPortalController.createPortalAccount);
labsRouter.get('/:id/portal-account', labPortalController.getPortalAccount);
labsRouter.post('/:id/portal-account/reset-password', labPortalController.resetPortalPassword);
labsRouter.post('/:id/portal-account/resend-invite', labPortalController.resendPortalInvite);
