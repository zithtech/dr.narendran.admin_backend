import { Router } from 'express';
import { LabServicesController } from './lab-services.controller.js';

export const labServicesRouter = Router();

labServicesRouter.get('/', LabServicesController.getAll);
labServicesRouter.post('/', LabServicesController.create);
labServicesRouter.put('/:id', LabServicesController.update);
labServicesRouter.delete('/:id', LabServicesController.delete);
