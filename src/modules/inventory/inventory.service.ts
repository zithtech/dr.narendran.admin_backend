import { NotFoundError, ValidationError } from '@/http/errors.js';
import * as repository from './inventory.repository.js';
import type {
  AdjustStockInput,
  DamagedStockInput,
  QueryHistoryInput,
  ReturnStockInput,
  StockInInput,
  StockOutInput,
} from './inventory.schema.js';
import * as strengthRepo from '../medicine_strengths/medicine_strengths.repository.js';
import { formatVariant } from '../medicine_strengths/medicine_strengths.service.js';

export async function recordStockIn(
  medicineStrengthId: string,
  input: StockInInput,
  performedBy?: string
) {
  const transactionType = input.is_opening_stock ? 'OPENING_STOCK' : 'STOCK_IN';

  try {
    const result = await repository.executeStockMovement({
      medicineStrengthId,
      transactionType,
      quantityDelta: input.quantity,
      unitCost: input.unit_cost,
      referenceNumber: input.reference_number,
      reason: input.is_opening_stock ? 'Opening stock verification' : 'Stock receipt',
      notes: input.notes,
      performedBy,
    });

    return {
      variant: formatVariant(result.updatedVariant),
      historyRecord: result.historyRecord,
    };
  } catch (err: any) {
    if (err.message === 'MEDICINE_VARIANT_NOT_FOUND') {
      throw new NotFoundError('Medicine strength variant not found');
    }
    throw err;
  }
}

export async function recordStockOut(
  medicineStrengthId: string,
  input: StockOutInput,
  performedBy?: string
) {
  try {
    const result = await repository.executeStockMovement({
      medicineStrengthId,
      transactionType: 'STOCK_OUT',
      quantityDelta: -Math.abs(input.quantity),
      referenceNumber: input.reference_number,
      reason: 'Manual dispensing / stock issue',
      notes: input.notes,
      performedBy,
    });

    return {
      variant: formatVariant(result.updatedVariant),
      historyRecord: result.historyRecord,
    };
  } catch (err: any) {
    if (err.message === 'MEDICINE_VARIANT_NOT_FOUND') {
      throw new NotFoundError('Medicine strength variant not found');
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      throw new ValidationError('Insufficient stock on hand for this operation');
    }
    throw err;
  }
}

export async function adjustStock(
  medicineStrengthId: string,
  input: AdjustStockInput,
  performedBy?: string
) {
  const current = await strengthRepo.findById(medicineStrengthId);
  if (!current) {
    throw new NotFoundError('Medicine strength variant not found');
  }

  const currentOnHand = current.available_quantity;
  const variance = input.actual_quantity - currentOnHand;

  if (variance === 0) {
    throw new ValidationError('Actual counted quantity matches system balance. No variance to adjust.');
  }

  try {
    const result = await repository.executeStockMovement({
      medicineStrengthId,
      transactionType: 'ADJUSTMENT',
      quantityDelta: variance,
      reason: input.reason,
      notes: input.notes,
      performedBy,
    });

    return {
      variant: formatVariant(result.updatedVariant),
      historyRecord: result.historyRecord,
      variance,
    };
  } catch (err: any) {
    if (err.message === 'MEDICINE_VARIANT_NOT_FOUND') {
      throw new NotFoundError('Medicine strength variant not found');
    }
    throw err;
  }
}

export async function recordDamagedStock(
  medicineStrengthId: string,
  input: DamagedStockInput,
  performedBy?: string
) {
  try {
    const result = await repository.executeStockMovement({
      medicineStrengthId,
      transactionType: input.reason,
      quantityDelta: -Math.abs(input.quantity),
      reason: input.reason === 'DAMAGED' ? 'Damaged / broken goods write-off' : 'Expired stock disposal',
      notes: input.notes,
      performedBy,
    });

    return {
      variant: formatVariant(result.updatedVariant),
      historyRecord: result.historyRecord,
    };
  } catch (err: any) {
    if (err.message === 'MEDICINE_VARIANT_NOT_FOUND') {
      throw new NotFoundError('Medicine strength variant not found');
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      throw new ValidationError('Insufficient stock on hand to write off requested quantity');
    }
    throw err;
  }
}

export async function recordReturn(
  medicineStrengthId: string,
  input: ReturnStockInput,
  performedBy?: string
) {
  try {
    const result = await repository.executeStockMovement({
      medicineStrengthId,
      transactionType: 'RETURN',
      quantityDelta: Math.abs(input.quantity),
      referenceNumber: input.reference_number,
      reason: input.reason,
      notes: input.notes,
      performedBy,
    });

    return {
      variant: formatVariant(result.updatedVariant),
      historyRecord: result.historyRecord,
    };
  } catch (err: any) {
    if (err.message === 'MEDICINE_VARIANT_NOT_FOUND') {
      throw new NotFoundError('Medicine strength variant not found');
    }
    throw err;
  }
}

export async function getStockHistory(
  medicineStrengthId: string,
  query: QueryHistoryInput
) {
  const variant = await strengthRepo.findById(medicineStrengthId);
  if (!variant) {
    throw new NotFoundError('Medicine strength variant not found');
  }

  const { items, total } = await repository.getHistory(medicineStrengthId, query);
  return {
    variant: formatVariant(variant),
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  };
}

export async function getSummaryStats() {
  return repository.getSummaryStats();
}
