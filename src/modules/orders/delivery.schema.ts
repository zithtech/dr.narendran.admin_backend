import { z } from 'zod';

import type { DeliveryMethodType } from './delivery.types.js';

export function normalizeDeliveryMethod(
  method?: string | null,
): DeliveryMethodType | null {
  if (!method) return null;
  const lower = method.toLowerCase().trim();
  if (
    lower === 'courier' ||
    lower === 'third_party_courier' ||
    lower === 'third-party-courier' ||
    lower === 'third_party' ||
    lower === 'third-party' ||
    lower.includes('courier') ||
    lower.includes('third_party') ||
    lower.includes('third-party')
  ) {
    return 'THIRD_PARTY_COURIER';
  }
  if (
    lower === 'pharmacy_delivery' ||
    lower === 'pharmacy' ||
    lower === 'in_house' ||
    lower === 'in-house' ||
    lower.includes('pharmacy') ||
    lower.includes('rider')
  ) {
    return 'PHARMACY_DELIVERY';
  }
  return null;
}

export const deliveryMethodSchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      const norm = normalizeDeliveryMethod(val);
      return norm ?? val;
    }
    return val;
  },
  z.enum(['THIRD_PARTY_COURIER', 'PHARMACY_DELIVERY'], {
    message:
      "Delivery method must be 'THIRD_PARTY_COURIER' (or 'courier') or 'PHARMACY_DELIVERY' (or 'pharmacy_delivery')",
  }),
);

export const optionalDeliveryMethodSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'string') {
      const norm = normalizeDeliveryMethod(val);
      return norm ?? val;
    }
    return val;
  },
  z.enum(['THIRD_PARTY_COURIER', 'PHARMACY_DELIVERY']).optional().nullable(),
);

export const updateDeliveryMethodSchema = z.object({
  delivery_method: deliveryMethodSchema,
});

export type UpdateDeliveryMethodInput = z.infer<
  typeof updateDeliveryMethodSchema
>;

export const updateCourierSchema = z.object({
  courier_name: z.string().trim().min(1, 'Courier name is required'),
  tracking_number: z.string().trim().min(1, 'Tracking number is required'),
  courier_tracking_number: z.string().trim().min(1).optional().nullable(),
  tracking_url: z
    .string()
    .trim()
    .refine(val => !val || val === '' || /^https?:\/\//i.test(val), {
      message: 'Tracking URL must be a valid URL starting with http:// or https://',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_tracking_url: z
    .string()
    .trim()
    .refine(val => !val || val === '' || /^https?:\/\//i.test(val), {
      message: 'Tracking URL must be a valid URL starting with http:// or https://',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_contact_number: z
    .string()
    .trim()
    .regex(/^[+0-9\s\-()]{7,20}$/, 'Invalid courier contact phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_contact_phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s\-()]{7,20}$/, 'Invalid courier contact phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s\-()]{7,20}$/, 'Invalid courier contact phone number')
    .optional()
    .nullable()
    .or(z.literal('')),
  notes: z.string().trim().optional().nullable(),
});

export type UpdateCourierInput = z.infer<typeof updateCourierSchema>;

export const updatePharmacyDeliverySchema = z.object({
  delivery_person_name: z
    .string()
    .trim()
    .min(2, "Delivery person's name must be at least 2 characters"),
  delivery_person_phone: z
    .string()
    .trim()
    .min(5, "Delivery person's phone number is required")
    .regex(/^[+0-9\s\-()]{7,20}$/, "Invalid delivery person's phone number"),
  notes: z.string().trim().optional().nullable(),
});

export type UpdatePharmacyDeliveryInput = z.infer<
  typeof updatePharmacyDeliverySchema
>;

export const updateEtaSchema = z.object({
  estimated_delivery_time: z
    .string()
    .trim()
    .min(1, 'Estimated delivery time is required')
    .refine(val => !isNaN(Date.parse(val)), {
      message: 'Invalid ETA datetime format. Please provide a valid date/time.',
    })
    .optional()
    .nullable(),
  estimated_delivery_at: z
    .string()
    .trim()
    .refine(val => !isNaN(Date.parse(val)), {
      message: 'Invalid ETA datetime format. Please provide a valid date/time.',
    })
    .optional()
    .nullable(),
  delay_remarks: z.string().trim().optional().nullable().or(z.literal('')),
  notes: z.string().trim().optional().nullable().or(z.literal('')),
});

export type UpdateEtaInput = z.infer<typeof updateEtaSchema>;

export const updateDeliveryStatusSchema = z.object({
  status: z.string().trim().min(1, 'Delivery status is required'),
  notes: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
  cancellation_reason: z.string().trim().optional().nullable(),
});

export type UpdateDeliveryStatusInput = z.infer<
  typeof updateDeliveryStatusSchema
>;

/**
 * Composite schema for unified delivery updates from Admin Frontend.
 * Permits nulls, empty strings, and optional fields for cross-platform flexibility.
 */
export const compositeDeliverySchema = z.object({
  delivery_method: optionalDeliveryMethodSchema,

  // Courier fields (permits null, string, or empty)
  courier_name: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  tracking_number: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_tracking_number: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  tracking_url: z
    .string()
    .trim()
    .refine(val => !val || val === '' || /^https?:\/\//i.test(val), {
      message: 'Tracking URL must be a valid URL starting with http:// or https://',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_tracking_url: z
    .string()
    .trim()
    .refine(val => !val || val === '' || /^https?:\/\//i.test(val), {
      message: 'Tracking URL must be a valid URL starting with http:// or https://',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_contact_number: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_contact_phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  courier_phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),

  // Pharmacy delivery rider fields
  delivery_person_name: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  delivery_person_phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),

  // ETA & Delay management
  estimated_delivery_time: z
    .string()
    .trim()
    .refine(val => !val || val === '' || !isNaN(Date.parse(val)), {
      message: 'Invalid ETA datetime format. Please provide a valid date/time.',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  estimated_delivery_at: z
    .string()
    .trim()
    .refine(val => !val || val === '' || !isNaN(Date.parse(val)), {
      message: 'Invalid ETA datetime format. Please provide a valid date/time.',
    })
    .optional()
    .nullable()
    .or(z.literal('')),
  delay_remarks: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),

  // Status & notes
  status: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  notes: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  note: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  reason: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
  cancellation_reason: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal('')),
});

export type CompositeDeliveryInput = z.infer<typeof compositeDeliverySchema>;
