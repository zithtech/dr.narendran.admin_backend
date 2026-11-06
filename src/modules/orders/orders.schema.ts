import { z } from 'zod';

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z
    .enum(['createdAt', 'totalAmount', 'orderNumber', 'status', 'paymentStatus'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  paymentStatus: z.string().trim().optional(),
  payment_status: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  user_id: z.string().trim().optional(),
  patient_id: z.string().trim().optional(),
});

export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;

export const orderIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Order ID is required'),
});

export type OrderIdParamInput = z.infer<typeof orderIdParamSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.string().trim().min(1, 'Order status is required'),
  cancellation_reason: z.string().trim().optional(),
  reason: z.string().trim().optional(),
  note: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
