import { createApiRouter, requirePermission } from '@/shared/index.js';

import { rbacController } from './rbac.controller.js';

export const rbacRouter = createApiRouter();

rbacRouter.get('/modules', rbacController.getModules);
rbacRouter.get(
  '/roles',
  requirePermission('ROLES', 'read', ['CLIENT_PORTALS', 'USERS']),
  rbacController.getRoles,
);
rbacRouter.get('/roles/:name', rbacController.getRole);
rbacRouter.post('/roles', requirePermission('ROLES', 'create'), rbacController.createRole);
rbacRouter.put('/roles/:name', requirePermission('ROLES', 'update'), rbacController.updateRole);
rbacRouter.delete('/roles/:name', requirePermission('ROLES', 'delete'), rbacController.deleteRole);
