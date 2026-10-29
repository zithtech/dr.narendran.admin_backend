import {Router} from 'express';

import {requireAuth} from '@/http/middleware/authenticate.js';

import {UserAccountsController} from './user_accounts.controller.js';

export const userAccountsRouter = Router();

// Assuming requireAuth ensures the admin is logged in, but you may need an admin specific guard
// For now matching other modules' security level which is handled by requireAuth or just mounted.
userAccountsRouter.get('/', UserAccountsController.getAll);
userAccountsRouter.post('/', UserAccountsController.create);
userAccountsRouter.put('/:id', UserAccountsController.update);
userAccountsRouter.delete('/:id', UserAccountsController.delete);
