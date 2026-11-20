import type { Request, Response } from 'express';
import * as service from './inventory.service.js';
import type {
  AdjustStockInput,
  BatchDispenseInput,
  DamagedStockInput,
  DispenseStockInput,
  QueryAllHistoryInput,
  QueryHistoryInput,
  ReturnStockInput,
  StockInInput,
  StockOutInput,
} from './inventory.schema.js';

export async function stockIn(
  input: { params: { id: string }; body: StockInInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.recordStockIn(
    input.params.id,
    input.body,
    req.user?.id
  );
  res.status(201).json({ success: true, ...result });
}

export async function stockOut(
  input: { params: { id: string }; body: StockOutInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.recordStockOut(
    input.params.id,
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function adjustStock(
  input: { params: { id: string }; body: AdjustStockInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.adjustStock(
    input.params.id,
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function damagedStock(
  input: { params: { id: string }; body: DamagedStockInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.recordDamagedStock(
    input.params.id,
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function returnStock(
  input: { params: { id: string }; body: ReturnStockInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.recordReturn(
    input.params.id,
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function getStockHistory(
  input: { params: { id: string }; query: QueryHistoryInput },
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.getStockHistory(
    input.params.id,
    input.query
  );
  res.json({ success: true, ...result });
}

export async function getSummaryStats(_input: unknown, _req: Request, res: Response): Promise<void> {
  const result = await service.getSummaryStats();
  res.json({ success: true, data: result });
}

export async function dispense(
  input: { params?: { id?: string }; body: DispenseStockInput },
  req: Request,
  res: Response
): Promise<void> {
  const targetVariantId = input.params?.id || input.body.medicine_strength_id;
  if (!targetVariantId) {
    res.status(400).json({ success: false, message: 'Medicine variant ID is required' });
    return;
  }
  const result = await service.recordDispense(
    targetVariantId,
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function batchDispense(
  input: { body: BatchDispenseInput },
  req: Request,
  res: Response
): Promise<void> {
  const result = await service.recordBatchDispense(
    input.body,
    req.user?.id
  );
  res.json({ success: true, ...result });
}

export async function getAllDispenseHistory(
  input: { query: QueryAllHistoryInput },
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.getAllDispenseHistory(input.query);
  res.json({ success: true, ...result });
}

export async function getReduceSummary(
  _input: unknown,
  _req: Request,
  res: Response
): Promise<void> {
  const result = await service.getReduceSummaryStats();
  res.json({ success: true, data: result });
}
