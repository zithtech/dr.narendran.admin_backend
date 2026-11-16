/* eslint-disable */
// @ts-nocheck
import {Router} from 'express';
import {
  TenantController,
  resolveTenantMiddleware,
} from './tenant.controller.js';

import {TenantAuthController} from './tenant.auth.controller.js';

export const tenantRouter = Router();

// Auth routes (Tenant Code passed in body)
tenantRouter.post('/auth/login', TenantAuthController.login);
tenantRouter.post('/auth/admin-login', TenantAuthController.adminLogin);
tenantRouter.post('/auth/forgot-password', TenantAuthController.forgotPassword);
tenantRouter.post('/auth/reset-password', TenantAuthController.resetPassword);

// Any route below requires a valid tenant header to resolve the DB
tenantRouter.use(resolveTenantMiddleware);
