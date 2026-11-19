import { z } from 'zod';

export const discountTypeEnum = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim().toUpperCase();
  if (s.includes('PERCENT') || s === '%') return 'PERCENTAGE';
  if (s.includes('FLAT') || s.includes('FIX') || s.includes('AMOUNT') || s === '₹') return 'FLAT';
  return val;
}, z.enum(['PERCENTAGE', 'FLAT']).nullable().optional());

export const medicineStrengthBodyFields = {
  strength: z
    .string()
    .trim()
    .min(1, 'Strength is required')
    .max(50, 'Strength cannot exceed 50 characters')
    .regex(/^[0-9a-zA-Z\s.,/+\-]+$/, 'Strength contains invalid characters'),
  strength_unit: z
    .string()
    .trim()
    .min(1, 'Strength unit is required')
    .max(20, 'Strength unit cannot exceed 20 characters'),
  dosage_form: z
    .string()
    .trim()
    .min(1, 'Dosage form is required')
    .max(50, 'Dosage form cannot exceed 50 characters'),
  strip_count: z.number().int().nonnegative().optional().default(0),
  tablets_per_strip: z
    .coerce
    .number()
    .int()
    .positive('Tablets per strip must be positive')
    .max(1000, 'Tablets per strip cannot exceed 1000')
    .nullable()
    .optional(),
  total_tablets: z.number().int().nonnegative().optional().default(0),
  available_quantity: z.number().int().nonnegative().optional().default(0),
  mrp: z
    .coerce
    .number()
    .nonnegative('MRP cannot be negative')
    .max(999999.99, 'MRP cannot exceed 999,999.99')
    .nullable()
    .optional(),
  discount_type: discountTypeEnum,
  discount_value: z
    .coerce
    .number()
    .nonnegative('Discount value cannot be negative')
    .max(999999.99, 'Discount value cannot exceed 999,999.99')
    .nullable()
    .optional(),
  purchase_price: z
    .coerce
    .number()
    .nonnegative('Purchase price cannot be negative')
    .max(999999.99, 'Purchase price cannot exceed 999,999.99')
    .nullable()
    .optional(),
  reorder_level: z
    .coerce
    .number()
    .int()
    .nonnegative('Reorder level cannot be negative')
    .max(100000, 'Reorder level cannot exceed 100,000')
    .optional()
    .default(10),
  variant_code: z
    .string()
    .trim()
    .max(50, 'Variant code cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9-_]*$/, 'Variant code can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  barcode: z
    .string()
    .trim()
    .max(50, 'Barcode cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9-]*$/, 'Barcode can only contain letters, numbers, and hyphens')
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  notes: z.string().trim().max(1000).optional(),
};

const refineDiscountLogic = (data: any, ctx: z.RefinementCtx) => {
  if (data.discount_type === 'PERCENTAGE' && data.discount_value != null && data.discount_value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Percentage discount cannot exceed 100%',
      path: ['discount_value'],
    });
  }
  if (
    data.discount_type === 'FLAT' &&
    data.discount_value != null &&
    data.mrp != null &&
    data.discount_value > data.mrp
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Flat discount cannot exceed MRP',
      path: ['discount_value'],
    });
  }
};

export const createMedicineStrengthBodySchema = z
  .object(medicineStrengthBodyFields)
  .superRefine(refineDiscountLogic);

export const createMedicineStrengthSchema = z
  .object({
    medicineId: z.string().uuid('Invalid medicine ID'),
    ...medicineStrengthBodyFields,
  })
  .superRefine(refineDiscountLogic);

export const updateMedicineStrengthSchema = z.object({
  strength: z
    .string()
    .trim()
    .min(1, 'Strength is required')
    .max(50, 'Strength cannot exceed 50 characters')
    .regex(/^[0-9a-zA-Z\s.,/+\-]+$/, 'Strength contains invalid characters')
    .optional(),
  strength_unit: z
    .string()
    .trim()
    .min(1, 'Strength unit is required')
    .max(20, 'Strength unit cannot exceed 20 characters')
    .optional(),
  dosage_form: z
    .string()
    .trim()
    .min(1, 'Dosage form is required')
    .max(50, 'Dosage form cannot exceed 50 characters')
    .optional(),
  tablets_per_strip: z
    .coerce
    .number()
    .int()
    .positive('Tablets per strip must be positive')
    .max(1000, 'Tablets per strip cannot exceed 1000')
    .nullable()
    .optional(),
  mrp: z
    .coerce
    .number()
    .nonnegative('MRP cannot be negative')
    .max(999999.99, 'MRP cannot exceed 999,999.99')
    .nullable()
    .optional(),
  discount_type: discountTypeEnum,
  discount_value: z
    .coerce
    .number()
    .nonnegative('Discount value cannot be negative')
    .max(999999.99, 'Discount value cannot exceed 999,999.99')
    .nullable()
    .optional(),
  purchase_price: z
    .coerce
    .number()
    .nonnegative('Purchase price cannot be negative')
    .max(999999.99, 'Purchase price cannot exceed 999,999.99')
    .nullable()
    .optional(),
  reorder_level: z
    .coerce
    .number()
    .int()
    .nonnegative('Reorder level cannot be negative')
    .max(100000, 'Reorder level cannot exceed 100,000')
    .optional(),
  variant_code: z
    .string()
    .trim()
    .max(50, 'Variant code cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9-_]*$/, 'Variant code can only contain letters, numbers, hyphens, and underscores')
    .nullable()
    .optional(),
  barcode: z
    .string()
    .trim()
    .max(50, 'Barcode cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9-]*$/, 'Barcode can only contain letters, numbers, and hyphens')
    .nullable()
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).superRefine(refineDiscountLogic);

export const queryMedicineStrengthsSchema = z.object({
  medicineId: z.string().uuid().optional(),
  search: z.string().optional(),
  dosage_form: z.string().optional(),
  status: z.preprocess((val) => {
    if (typeof val === 'string') return val.toUpperCase();
    return val;
  }, z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional()),
  stock_status: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(1000).optional().default(20),
});

export type CreateMedicineStrengthInput = z.infer<typeof createMedicineStrengthSchema>;
export type UpdateMedicineStrengthInput = z.infer<typeof updateMedicineStrengthSchema>;
export type QueryMedicineStrengthsInput = z.infer<typeof queryMedicineStrengthsSchema>;
