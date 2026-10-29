import { ConflictError, NotFoundError, ValidationError } from '@/http/errors.js';
import * as repository from './medicine_strengths.repository.js';
import type {
  CreateMedicineStrengthInput,
  QueryMedicineStrengthsInput,
  UpdateMedicineStrengthInput,
} from './medicine_strengths.schema.js';

export function normalizeDiscountType(raw?: string | null): 'PERCENTAGE' | 'FLAT' | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s.includes('PERCENT') || s === '%') return 'PERCENTAGE';
  if (s.includes('FLAT') || s.includes('FIX') || s.includes('AMOUNT') || s === '₹') return 'FLAT';
  return null;
}

export function calculateFinalPrice(
  mrp?: number | null,
  discountType?: string | null,
  discountValue?: number | null
): number | null {
  if (mrp === undefined || mrp === null || isNaN(mrp)) {
    return null;
  }
  const numericMrp = Number(mrp);
  if (numericMrp < 0) {
    return null;
  }

  const normalized = normalizeDiscountType(discountType);
  if (
    !normalized ||
    discountValue === undefined ||
    discountValue === null ||
    isNaN(discountValue) ||
    Number(discountValue) <= 0
  ) {
    return Number(numericMrp.toFixed(2));
  }

  const numDiscount = Number(discountValue);

  if (normalized === 'PERCENTAGE') {
    const finalPrice = numericMrp - (numericMrp * numDiscount) / 100;
    return Number(Math.max(0, finalPrice).toFixed(2));
  }

  if (normalized === 'FLAT') {
    const finalPrice = numericMrp - numDiscount;
    return Number(Math.max(0, finalPrice).toFixed(2));
  }

  return Number(numericMrp.toFixed(2));
}

export function formatVariant(variant: repository.MedicineStrengthRow) {
  const tabsPerStrip = variant.tablets_per_strip ?? null;
  const availQty = variant.available_quantity ?? 0;
  const stripCount = tabsPerStrip && tabsPerStrip > 0 ? Math.floor(availQty / tabsPerStrip) : 0;
  const looseTablets = tabsPerStrip && tabsPerStrip > 0 ? availQty % tabsPerStrip : 0;

  let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
  if (availQty === 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (availQty <= variant.reorder_level) {
    stockStatus = 'LOW_STOCK';
  }

  return {
    ...variant,
    strip_count: stripCount,
    loose_tablets: looseTablets,
    total_tablets: tabsPerStrip ? availQty : 0,
    stock_status: stockStatus,
  };
}

export async function getById(id: string) {
  const variant = await repository.findById(id);
  if (!variant) {
    throw new NotFoundError('Medicine strength variant not found');
  }
  return formatVariant(variant);
}

export async function getByMedicineId(medicineId: string) {
  const variants = await repository.findByMedicineId(medicineId);
  return variants.map(formatVariant);
}

export async function listVariants(query: QueryMedicineStrengthsInput) {
  const { items, total } = await repository.listVariants(query);
  return {
    items: items.map(formatVariant),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  };
}

export async function createVariant(input: CreateMedicineStrengthInput) {
  const normDiscountType = normalizeDiscountType(input.discount_type);
  if (normDiscountType === 'PERCENTAGE' && input.discount_value !== undefined && input.discount_value !== null && input.discount_value > 100) {
    throw new ValidationError('Percentage discount cannot exceed 100%');
  }
  if (normDiscountType === 'FLAT' && input.discount_value !== undefined && input.discount_value !== null && input.mrp !== undefined && input.mrp !== null && input.discount_value > input.mrp) {
    throw new ValidationError('Flat discount cannot exceed MRP');
  }
  const finalPrice = calculateFinalPrice(input.mrp, normDiscountType, input.discount_value);

  try {
    const variant = await repository.createVariant({
      ...input,
      discount_type: normDiscountType,
      final_price: finalPrice,
    });
    return formatVariant(variant);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new ConflictError(
        `A variant with strength "${input.strength} ${input.strength_unit}" (${input.dosage_form}) already exists for this medicine.`
      );
    }
    throw error;
  }
}

export async function updateVariant(id: string, input: UpdateMedicineStrengthInput) {
  const existing = await repository.findById(id);
  if (!existing) {
    throw new NotFoundError('Medicine strength variant not found');
  }

  const effectiveMrp = input.mrp !== undefined ? input.mrp : existing.mrp;
  const effectiveDiscType =
    input.discount_type !== undefined
      ? normalizeDiscountType(input.discount_type)
      : normalizeDiscountType(existing.discount_type);
  const effectiveDiscVal =
    input.discount_value !== undefined ? input.discount_value : existing.discount_value;

  if (effectiveDiscType === 'PERCENTAGE' && effectiveDiscVal !== undefined && effectiveDiscVal !== null && effectiveDiscVal > 100) {
    throw new ValidationError('Percentage discount cannot exceed 100%');
  }
  if (effectiveDiscType === 'FLAT' && effectiveDiscVal !== undefined && effectiveDiscVal !== null && effectiveMrp !== undefined && effectiveMrp !== null && effectiveDiscVal > effectiveMrp) {
    throw new ValidationError('Flat discount cannot exceed MRP');
  }

  const finalPrice = calculateFinalPrice(effectiveMrp, effectiveDiscType, effectiveDiscVal);

  try {
    const updated = await repository.updateVariant(id, {
      ...input,
      ...(input.discount_type !== undefined ? { discount_type: effectiveDiscType } : {}),
      final_price: finalPrice,
    });
    if (!updated) {
      throw new NotFoundError('Medicine strength variant not found');
    }
    return formatVariant(updated);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new ConflictError(
        `A variant with this strength and dosage form already exists for this medicine.`
      );
    }
    throw error;
  }
}

export async function deleteVariant(id: string) {
  const existing = await repository.findById(id);
  if (!existing) {
    throw new NotFoundError('Medicine strength variant not found');
  }
  const deleted = await repository.deleteVariant(id);
  return { success: deleted };
}
