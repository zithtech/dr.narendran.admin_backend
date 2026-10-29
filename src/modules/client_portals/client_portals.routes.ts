import { Router } from 'express';
import { clientPortalsController } from './client_portals.controller.js';

export const clientPortalsRouter = Router();

// Client portal authentication & verification (Public)
clientPortalsRouter.post('/auth/login', clientPortalsController.clientLogin);
clientPortalsRouter.get('/verify-token/:token', clientPortalsController.verifyPortalToken);

// Client portal management
clientPortalsRouter.get('/', clientPortalsController.getAll);
clientPortalsRouter.post('/', clientPortalsController.create);
clientPortalsRouter.post('/:id/resend-invite', clientPortalsController.resendInvite);
clientPortalsRouter.put('/:id', clientPortalsController.update);
clientPortalsRouter.delete('/:id', clientPortalsController.delete);
