import { z } from 'zod';

export const stockInSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  unit_cost: z.number().nonnegative().optional(),
  reference_number: z.string().max(100).optional(),
  is_opening_stock: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

export const stockOutSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  reference_number: z.string().max(100).optional(),
  notes: z.string().optional(),
});

export const adjustStockSchema = z.object({
  actual_quantity: z.number().int().nonnegative('Actual quantity cannot be negative'),
  reason: z.string().min(3, 'A clear reason for the stock adjustment is mandatory'),
  notes: z.string().optional(),
});

export const damagedStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  reason: z.enum(['DAMAGED', 'EXPIRED']),
  notes: z.string().optional(),
});

export const returnStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  reference_number: z.string().max(100).optional(),
  reason: z.string().min(3, 'Reason for return is required'),
  notes: z.string().optional(),
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
