import { Router } from 'express';

import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { clientPortalsController } from './client_portals.controller.js';

export const clientPortalsRouter = Router();

// Client portal authentication & verification (Public)
clientPortalsRouter.post('/auth/login', clientPortalsController.clientLogin);
clientPortalsRouter.get('/verify-token/:token', clientPortalsController.verifyPortalToken);

// Client portal management
clientPortalsRouter.get('/', requirePermission('CLIENT_PORTALS', 'read'), clientPortalsController.getAll);
clientPortalsRouter.post('/', requirePermission('CLIENT_PORTALS', 'create'), clientPortalsController.create);
clientPortalsRouter.post('/:id/resend-invite', requirePermission('CLIENT_PORTALS', 'update'), clientPortalsController.resendInvite);
clientPortalsRouter.put('/:id', requirePermission('CLIENT_PORTALS', 'update'), clientPortalsController.update);
clientPortalsRouter.delete('/:id', requirePermission('CLIENT_PORTALS', 'delete'), clientPortalsController.delete);
