import { createApiRouter } from '@/shared/index.js';

import { rbacController } from './rbac.controller.js';

export const rbacRouter = createApiRouter();

rbacRouter.get('/modules', rbacController.getModules);
rbacRouter.get('/roles', rbacController.getRoles);
rbacRouter.get('/roles/:name', rbacController.getRole);
rbacRouter.post('/roles', rbacController.createRole);
rbacRouter.put('/roles/:name', rbacController.updateRole);
rbacRouter.delete('/roles/:name', rbacController.deleteRole);
