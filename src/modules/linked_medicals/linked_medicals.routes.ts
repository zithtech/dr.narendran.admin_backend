import { Router } from 'express';
import { linkedMedicalsController } from './linked_medicals.controller.js';

export const linkedMedicalsRouter = Router();

linkedMedicalsRouter.get('/', linkedMedicalsController.getAll);
linkedMedicalsRouter.post('/', linkedMedicalsController.create);
linkedMedicalsRouter.put('/:id', linkedMedicalsController.update);
linkedMedicalsRouter.delete('/:id', linkedMedicalsController.delete);
