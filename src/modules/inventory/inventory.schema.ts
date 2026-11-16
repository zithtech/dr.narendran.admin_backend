import { z } from 'zod';

export const stockInSchema = z.object({
  quantity: z
    .coerce
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero')
    .max(1000000, 'Quantity cannot exceed 1,000,000'),
  unit_cost: z
    .coerce
    .number()
    .nonnegative('Unit cost cannot be negative')
    .max(999999.99, 'Unit cost cannot exceed 999,999.99')
    .optional()
    .nullable(),
  reference_number: z
    .string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\-_/#\s]*$/, 'Reference number contains invalid characters')
    .optional()
    .nullable(),
  is_opening_stock: z.boolean().optional().default(false),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const stockOutSchema = z.object({
  quantity: z
    .coerce
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero')
    .max(1000000, 'Quantity cannot exceed 1,000,000'),
  reference_number: z
    .string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\-_/#\s]*$/, 'Reference number contains invalid characters')
    .optional()
    .nullable(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const adjustStockSchema = z.object({
  actual_quantity: z
    .coerce
    .number()
    .int('Actual quantity must be an integer')
    .nonnegative('Actual quantity cannot be negative')
    .max(10000000, 'Actual quantity cannot exceed 10,000,000'),
  reason: z
    .string()
    .trim()
    .min(3, 'A clear reason for the stock adjustment is mandatory')
    .max(200, 'Reason cannot exceed 200 characters'),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const damagedStockSchema = z.object({
  quantity: z
    .coerce
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero')
    .max(1000000, 'Quantity cannot exceed 1,000,000'),
  reason: z.enum(['DAMAGED', 'EXPIRED']),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const returnStockSchema = z.object({
  quantity: z
    .coerce
    .number()
    .int('Quantity must be an integer')
    .positive('Quantity must be greater than zero')
    .max(1000000, 'Quantity cannot exceed 1,000,000'),
  reference_number: z
    .string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\-_/#\s]*$/, 'Reference number contains invalid characters')
    .optional()
    .nullable(),
  reason: z
    .string()
    .trim()
    .min(3, 'Reason for return is required')
    .max(200, 'Reason cannot exceed 200 characters'),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const queryHistorySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  transaction_type: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export type StockInInput = z.infer<typeof stockInSchema>;
export type StockOutInput = z.infer<typeof stockOutSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type DamagedStockInput = z.infer<typeof damagedStockSchema>;
export type ReturnStockInput = z.infer<typeof returnStockSchema>;
export type QueryHistoryInput = z.infer<typeof queryHistorySchema>;
