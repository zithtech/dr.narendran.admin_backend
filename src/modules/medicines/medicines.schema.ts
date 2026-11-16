import { z } from 'zod';

export const discountTypeSchema = z
  .union([
    z.enum([
      'Percentage',
      'Fixed Amount',
      'Fixed',
      'PERCENTAGE',
      'FLAT',
      'Flat',
      'FIXED',
      'FIXED AMOUNT',
      'fixed',
      'percentage',
      'flat',
    ]),
    z.literal(''),
  ])
  .optional()
  .nullable();

export const initialVariantItemSchema = z
  .object({
    id: z.string().uuid().optional().nullable(),
    strength: z.string().min(1, 'Strength is required'),
    strengthUnit: z.string().optional().nullable(),
    strength_unit: z.string().optional().nullable(),
    dosageForm: z.string().optional().nullable(),
    dosage_form: z.string().optional().nullable(),
    tabletsPerStrip: z.coerce.number().int().positive().optional().nullable(),
    tablets_per_strip: z.coerce.number().int().positive().optional().nullable(),
    mrp: z.coerce.number().min(0, 'MRP cannot be negative').optional().nullable(),
    discountType: discountTypeSchema,
    discount_type: discountTypeSchema,
    discountValue: z.coerce.number().min(0, 'Discount value cannot be negative').optional().nullable(),
    discount_value: z.coerce.number().min(0, 'Discount value cannot be negative').optional().nullable(),
    purchasePrice: z.coerce.number().min(0).optional().nullable(),
    purchase_price: z.coerce.number().min(0).optional().nullable(),
    reorderLevel: z.coerce.number().int().min(0).optional().default(10),
    reorder_level: z.coerce.number().int().min(0).optional().default(10),
    variantCode: z.string().optional().nullable(),
    variant_code: z.string().optional().nullable(),
    barcode: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'Active', 'Inactive']).optional().default('ACTIVE'),
    notes: z.string().optional().nullable(),
  })
  .transform((data) => ({
    id: data.id || undefined,
    strength: data.strength,
    strengthUnit: data.strengthUnit || data.strength_unit || 'mg',
    dosageForm: data.dosageForm || data.dosage_form || 'Tablet',
    tabletsPerStrip: data.tabletsPerStrip ?? data.tablets_per_strip ?? null,
    mrp: data.mrp !== undefined && data.mrp !== null ? Number(data.mrp) : null,
    discountType: data.discountType || data.discount_type || null,
    discountValue: data.discountValue !== undefined && data.discountValue !== null ? Number(data.discountValue) : null,
    purchasePrice: data.purchasePrice !== undefined && data.purchasePrice !== null ? Number(data.purchasePrice) : null,
    reorderLevel: data.reorderLevel ?? data.reorder_level ?? 10,
    variantCode: data.variantCode || data.variant_code || null,
    barcode: data.barcode || null,
    status: data.status || 'ACTIVE',
    notes: data.notes || null,
  }));

export const medicineNameSchema = z
  .string()
  .trim()
  .min(2, 'Medicine name must be at least 2 characters')
  .max(150, 'Medicine name cannot exceed 150 characters')
  .regex(/^[a-zA-Z0-9\s.,'&\-+/()]+$/, 'Medicine name contains invalid characters');

export const genericNameSchema = z
  .string()
  .trim()
  .max(150, 'Generic name cannot exceed 150 characters')
  .regex(/^[a-zA-Z0-9\s.,'&\-+/()]*$/, 'Generic name contains invalid characters')
  .optional()
  .nullable();

export const strengthSchema = z
  .string()
  .trim()
  .max(50, 'Strength cannot exceed 50 characters')
  .regex(/^[0-9a-zA-Z\s.,/+\-]*$/, 'Strength contains invalid characters')
  .optional()
  .nullable();

export const strengthUnitSchema = z
  .string()
  .trim()
  .max(20, 'Strength unit cannot exceed 20 characters')
  .optional()
  .nullable();

export const dosageFormSchema = z
  .string()
  .trim()
  .max(50, 'Dosage form cannot exceed 50 characters')
  .optional()
  .nullable();

export const therapeuticCategorySchema = z
  .string()
  .trim()
  .max(100, 'Therapeutic category cannot exceed 100 characters')
  .optional()
  .nullable();

export const subCategorySchema = z
  .string()
  .trim()
  .max(100, 'Sub category cannot exceed 100 characters')
  .regex(/^[a-zA-Z\s\-/]*$/, 'Sub category can only contain letters, spaces, hyphens, and slashes')
  .optional()
  .nullable();

export const manufacturerSchema = z
  .string()
  .trim()
  .max(150, 'Manufacturer cannot exceed 150 characters')
  .regex(/^[a-zA-Z0-9\s.,'&-]*$/, 'Manufacturer contains invalid characters')
  .optional()
  .nullable();

export const medicineCodeSchema = z
  .string()
  .trim()
  .max(50, 'Medicine code cannot exceed 50 characters')
  .regex(/^[a-zA-Z0-9-_]*$/, 'Medicine code can only contain letters, numbers, hyphens, and underscores')
  .optional()
  .nullable();

export const barcodeSchema = z
  .string()
  .trim()
  .max(50, 'Barcode cannot exceed 50 characters')
  .regex(/^[a-zA-Z0-9-]*$/, 'Barcode can only contain letters, numbers, and hyphens')
  .optional()
  .nullable();

export const mrpSchema = z.coerce
  .number()
  .min(0, 'MRP cannot be negative')
  .max(999999.99, 'MRP cannot exceed 999,999.99')
  .optional()
  .nullable();

export const discountValueSchema = z.coerce
  .number()
  .min(0, 'Discount value cannot be negative')
  .max(999999.99, 'Discount value cannot exceed 999,999.99')
  .optional()
  .nullable();

export const finalPriceSchema = z.coerce
  .number()
  .min(0, 'Final price cannot be negative')
  .max(999999.99, 'Final price cannot exceed 999,999.99')
  .optional()
  .nullable();

export const frequencySchema = z
  .string()
  .trim()
  .max(100, 'Frequency cannot exceed 100 characters')
  .regex(/^[a-zA-Z0-9\s\-/+,]*$/, 'Frequency contains invalid characters')
  .optional()
  .nullable();

export const durationSchema = z
  .string()
  .trim()
  .max(100, 'Duration cannot exceed 100 characters')
  .regex(/^[a-zA-Z0-9\s\-]*$/, 'Duration contains invalid characters')
  .optional()
  .nullable();

export const descriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description cannot exceed 1000 characters')
  .optional()
  .nullable();

export const createMedicineSchema = z
  .object({
    medicineName: medicineNameSchema,
    genericName: genericNameSchema,
    strength: strengthSchema,
    strengthUnit: strengthUnitSchema,
    dosageForm: dosageFormSchema,
    therapeuticCategory: therapeuticCategorySchema,
    subCategory: subCategorySchema,
    manufacturer: manufacturerSchema,
    prescriptionRequired: z.boolean().optional().default(false),
    status: z.enum(['Active', 'Inactive']).optional().default('Active'),
    medicineCode: medicineCodeSchema,
    barcode: barcodeSchema,
    mrp: mrpSchema,
    discountType: discountTypeSchema,
    discountValue: discountValueSchema,
    finalPrice: finalPriceSchema,
    frequency: frequencySchema,
    duration: durationSchema,
    description: descriptionSchema,
    initialVariants: z.array(initialVariantItemSchema).optional().nullable(),
    variants: z.array(initialVariantItemSchema).optional().nullable(),
  })
  .refine((data) => {
    if (data.discountType && data.discountType.toUpperCase().includes('PERCENT')) {
      if (data.discountValue !== null && data.discountValue !== undefined && data.discountValue > 100) {
        return false;
      }
    }
    return true;
  }, {
    message: 'Percentage discount cannot exceed 100%',
    path: ['discountValue'],
  })
  .refine((data) => {
    if (data.discountType && (data.discountType.toUpperCase().includes('FIXED') || data.discountType.toUpperCase().includes('FLAT'))) {
      if (data.mrp !== null && data.mrp !== undefined && data.discountValue !== null && data.discountValue !== undefined && data.discountValue > data.mrp) {
        return false;
      }
    }
    return true;
  }, {
    message: 'Fixed discount cannot exceed MRP',
    path: ['discountValue'],
  })
  .transform((data) => ({
    ...data,
    initialVariants: data.initialVariants || data.variants || undefined,
  }));

export const updateMedicineSchema = z
  .object({
    medicineName: medicineNameSchema.optional(),
    genericName: genericNameSchema,
    strength: strengthSchema,
    strengthUnit: strengthUnitSchema,
    dosageForm: dosageFormSchema,
    therapeuticCategory: therapeuticCategorySchema,
    subCategory: subCategorySchema,
    manufacturer: manufacturerSchema,
    prescriptionRequired: z.boolean().optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    medicineCode: medicineCodeSchema,
    barcode: barcodeSchema,
    mrp: mrpSchema,
    discountType: discountTypeSchema,
    discountValue: discountValueSchema,
    finalPrice: finalPriceSchema,
    frequency: frequencySchema,
    duration: durationSchema,
    description: descriptionSchema,
    initialVariants: z.array(initialVariantItemSchema).optional().nullable(),
    variants: z.array(initialVariantItemSchema).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine((data) => {
    if (data.discountType && data.discountType.toUpperCase().includes('PERCENT')) {
      if (data.discountValue !== null && data.discountValue !== undefined && data.discountValue > 100) {
        return false;
      }
    }
    return true;
  }, {
    message: 'Percentage discount cannot exceed 100%',
    path: ['discountValue'],
  })
  .refine((data) => {
    if (data.discountType && (data.discountType.toUpperCase().includes('FIXED') || data.discountType.toUpperCase().includes('FLAT'))) {
      if (data.mrp !== null && data.mrp !== undefined && data.discountValue !== null && data.discountValue !== undefined && data.discountValue > data.mrp) {
        return false;
      }
    }
    return true;
  }, {
    message: 'Fixed discount cannot exceed MRP',
    path: ['discountValue'],
  })
  .transform((data) => ({
    ...data,
    initialVariants: data.initialVariants || data.variants || undefined,
  }));

export const listMedicinesSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  category: z.string().optional(),
  dosageForm: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
});

export const bulkImportMedicineItemSchema = z.object({
  medicineName: z.string().min(1, 'Medicine name is required'),
  genericName: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  strengthUnit: z.string().optional().nullable(),
  dosageForm: z.string().optional().nullable(),
  therapeuticCategory: z.string().optional().nullable(),
  subCategory: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  prescriptionRequired: z.boolean().optional().default(false),
  status: z.enum(['Active', 'Inactive', 'ACTIVE', 'INACTIVE']).optional().default('Active'),
  medicineCode: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  mrp: z.coerce.number().min(0, 'MRP cannot be negative').optional().nullable(),
  discountType: discountTypeSchema,
  discountValue: z.coerce.number().min(0, 'Discount value cannot be negative').optional().nullable(),
  finalPrice: z.coerce.number().optional().nullable(),
  frequency: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  tabletsPerStrip: z.coerce.number().int().positive().optional().nullable(),
  openingStock: z.coerce.number().int().min(0).optional().nullable(),
  purchasePrice: z.coerce.number().min(0).optional().nullable(),
  reorderLevel: z.coerce.number().int().min(0).optional().default(10),
  variantCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const bulkImportSchema = z.object({
  strategy: z.enum(['SKIP_EXISTING', 'UPDATE_EXISTING']).default('SKIP_EXISTING'),
  medicines: z.array(bulkImportMedicineItemSchema).min(1, 'At least one medicine is required'),
});

export const bulkValidateSchema = z.object({
  medicines: z.array(z.record(z.string(), z.any())).min(1, 'At least one row is required'),
});

export const aiSearchMedicineSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Search query is too long'),
});

export interface AIMedicineSuggestion {
  medicineName: string;
  genericName: string | null;
  dosageForm: string | null;
  strength: string | null;
  strengthUnit: string | null;
  therapeuticCategory: string | null;
  subCategory: string | null;
  manufacturer: string | null;
  prescriptionRequired: boolean;
  status?: 'Active' | 'Inactive';
  medicineCode?: string | null;
  barcode?: string | null;
  mrp?: number | null;
  discountType?: 'Percentage' | 'Fixed Amount' | null;
  discountValue?: number | null;
  finalPrice?: number | null;
  frequency?: string | null;
  duration?: string | null;
  description?: string | null;
}

export type CreateMedicineInput = z.output<typeof createMedicineSchema>;
export type UpdateMedicineInput = z.output<typeof updateMedicineSchema>;
export type ListMedicinesQuery = z.output<typeof listMedicinesSchema>;
export type BulkImportInput = z.output<typeof bulkImportSchema>;
export type BulkImportMedicineItem = z.output<typeof bulkImportMedicineItemSchema>;
export type BulkValidateInput = z.output<typeof bulkValidateSchema>;
export type AiSearchMedicineInput = z.output<typeof aiSearchMedicineSchema>;


export const createPackageSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  medicineIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID')).min(1, 'At least one medicine is required'),
});

export const updatePackageSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  medicineIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID')).min(1, 'At least one medicine is required'),
});

export type CreatePackageInput = z.output<typeof createPackageSchema>;
export type UpdatePackageInput = z.output<typeof updatePackageSchema>;

