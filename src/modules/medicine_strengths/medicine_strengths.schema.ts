import { z } from 'zod';

export const discountTypeEnum = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim().toUpperCase();
  if (s.includes('PERCENT') || s === '%') return 'PERCENTAGE';
  if (s.includes('FLAT') || s.includes('FIX') || s.includes('AMOUNT') || s === '₹') return 'FLAT';
  return val;
}, z.enum(['PERCENTAGE', 'FLAT']).nullable().optional());

export const createMedicineStrengthSchema = z.object({
  medicineId: z.string().uuid('Invalid medicine ID'),
  strength: z.string().min(1, 'Strength is required'),
  strength_unit: z.string().min(1, 'Strength unit is required'),
  dosage_form: z.string().min(1, 'Dosage form is required'),
  strip_count: z.number().int().nonnegative().optional().default(0),
  tablets_per_strip: z.number().int().positive().nullable().optional(),
  total_tablets: z.number().int().nonnegative().optional().default(0),
  available_quantity: z.number().int().nonnegative().optional().default(0),
  mrp: z.number().nonnegative('MRP cannot be negative').nullable().optional(),
  discount_type: discountTypeEnum,
  discount_value: z.number().nonnegative('Discount value cannot be negative').nullable().optional(),
  purchase_price: z.number().nonnegative('Purchase price cannot be negative').nullable().optional(),
  reorder_level: z.number().int().nonnegative().optional().default(10),
  variant_code: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  notes: z.string().optional(),
});

export const updateMedicineStrengthSchema = z.object({
  strength: z.string().min(1, 'Strength is required').optional(),
  strength_unit: z.string().min(1, 'Strength unit is required').optional(),
  dosage_form: z.string().min(1, 'Dosage form is required').optional(),
  tablets_per_strip: z.number().int().positive().nullable().optional(),
  mrp: z.number().nonnegative('MRP cannot be negative').nullable().optional(),
  discount_type: discountTypeEnum,
  discount_value: z.number().nonnegative('Discount value cannot be negative').nullable().optional(),
  purchase_price: z.number().nonnegative('Purchase price cannot be negative').nullable().optional(),
  reorder_level: z.number().int().nonnegative().optional(),
  variant_code: z.string().max(100).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().nullable().optional(),
});

export const queryMedicineStrengthsSchema = z.object({
  medicineId: z.string().uuid().optional(),
  search: z.string().optional(),
  dosage_form: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional(),
  stock_status: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type CreateMedicineStrengthInput = z.infer<typeof createMedicineStrengthSchema>;
export type UpdateMedicineStrengthInput = z.infer<typeof updateMedicineStrengthSchema>;
export type QueryMedicineStrengthsInput = z.infer<typeof queryMedicineStrengthsSchema>;
