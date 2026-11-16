import {Router} from 'express';

import {requirePermission} from '@/http/middleware/rbac.middleware.js';

import {UserAccountsController} from './user_accounts.controller.js';

export const userAccountsRouter = Router();

userAccountsRouter.get('/', requirePermission('USERS', 'read'), UserAccountsController.getAll);
userAccountsRouter.post('/', requirePermission('USERS', 'create'), UserAccountsController.create);
userAccountsRouter.put('/:id', requirePermission('USERS', 'update'), UserAccountsController.update);
userAccountsRouter.delete('/:id', requirePermission('USERS', 'delete'), UserAccountsController.delete);
