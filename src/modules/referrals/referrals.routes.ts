import { Router } from 'express';

import { requirePermission } from '@/http/middleware/rbac.middleware.js';

import { referralsController } from './referrals.controller.js';

export const referralsRouter = Router();

referralsRouter.get('/', requirePermission('REFERRALS', 'read', ['HOSPITALS']), referralsController.getAll);
referralsRouter.get('/:id', requirePermission('REFERRALS', 'read', ['HOSPITALS']), referralsController.getById);
referralsRouter.post('/', requirePermission('REFERRALS', 'create', ['HOSPITALS']), referralsController.create);
referralsRouter.put('/:id', requirePermission('REFERRALS', 'update', ['HOSPITALS']), referralsController.update);
referralsRouter.delete('/:id', requirePermission('REFERRALS', 'delete', ['HOSPITALS']), referralsController.delete);
