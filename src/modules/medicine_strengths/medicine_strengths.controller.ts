import type { Request, Response } from 'express';
import * as service from './medicine_strengths.service.js';
import type {
  CreateMedicineStrengthInput,
  QueryMedicineStrengthsInput,
  UpdateMedicineStrengthInput,
} from './medicine_strengths.schema.js';

export async function getById(req: Request, res: Response): Promise<void> {
  const result = await service.getById(req.params['id'] as string);
  res.json({ success: true, data: result });
}

export async function getByMedicineId(req: Request, res: Response): Promise<void> {
  const result = await service.getByMedicineId(req.params['medicineId'] as string);
  res.json({ success: true, data: result });
}

export async function listVariants(
  input: { query: QueryMedicineStrengthsInput },
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.listVariants(input.query);
  res.json({ success: true, ...result });
}

export async function createVariant(
  input: { body: CreateMedicineStrengthInput },
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.createVariant(input.body);
  res.status(201).json({ success: true, data: result });
}

export async function updateVariant(
  input: { params: { id: string }; body: UpdateMedicineStrengthInput },
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.updateVariant(input.params.id, input.body);
  res.json({ success: true, data: result });
}

export async function deleteVariant(req: Request, res: Response): Promise<void> {
  const result = await service.deleteVariant(req.params['id'] as string);
  res.json(result);
}
