import { createApiRouter } from '@/shared/index.js';

import { HospitalsController } from './hospitals.controller.js';

export const hospitalsRouter = createApiRouter();

hospitalsRouter.get('/', HospitalsController.getAll);
hospitalsRouter.post('/', HospitalsController.create);
hospitalsRouter.put('/:id', HospitalsController.update);
hospitalsRouter.delete('/:id', HospitalsController.delete);
