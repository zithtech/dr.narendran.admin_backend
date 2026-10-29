/* eslint-disable */
// @ts-nocheck
import {Router} from 'express';
import {MasterController} from './master.controller.js';

export const masterRouter = Router();

masterRouter.post('/login', MasterController.login);
masterRouter.post('/forgot-password', MasterController.forgotPassword);
masterRouter.post('/reset-password', MasterController.resetPassword);
masterRouter.post('/tenants', MasterController.createTenant);
masterRouter.get('/tenants', MasterController.listTenants);
masterRouter.get('/tenants/:id', MasterController.getTenant);
masterRouter.put('/tenants/:id', MasterController.updateTenant);
masterRouter.delete('/tenants/:id', MasterController.deleteTenant);

// --- Admin Master Login Management ---
masterRouter.get('/tenant-admins', MasterController.listTenantAdmins);
masterRouter.post('/tenant-admins', MasterController.createTenantAdmin);
masterRouter.put(
  '/tenant-admins/:adminId/status',
  MasterController.updateTenantAdminStatus,
);
masterRouter.put(
  '/tenant-admins/:adminId/password',
  MasterController.updateTenantAdminPassword,
);
masterRouter.put('/tenant-admins/:adminId', MasterController.updateTenantAdmin);
masterRouter.delete(
  '/tenant-admins/:adminId',
  MasterController.deleteTenantAdmin,
);

// --- Platform Admin Users (master_admin_users table) ---
masterRouter.get('/admin-users', MasterController.listMasterAdminUsers);
masterRouter.post('/admin-users', MasterController.createMasterAdminUser);
masterRouter.put('/admin-users/:id', MasterController.updateMasterAdminUser);
masterRouter.put(
  '/admin-users/:id/password',
  MasterController.updateMasterAdminUserPassword,
);
masterRouter.delete('/admin-users/:id', MasterController.deleteMasterAdminUser);
