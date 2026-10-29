import { z } from 'zod';

export const createAppointmentSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID'),
  purpose: z.string().trim().min(1, 'Purpose is required'),
  doctorId: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  patientNote: z
    .string()
    .trim()
    .max(500, 'Note must be under 500 characters')
    .optional(),
  patientName: z.string().trim().optional(),
  patientPhone: z.string().trim().optional(),
});

export const doctorBookAppointmentSchema = z.object({
  slotId: z.string().uuid('Invalid slot ID'),
  patientId: z.string().uuid('Invalid patient ID'),
  purpose: z.string().trim().min(1, 'Purpose is required'),
});

export const rescheduleAppointmentSchema = z.object({
  newSlotId: z.string().min(1, 'Slot ID is required'),
  reason: z
    .string()
    .trim()
    .max(300, 'Reason must be under 300 characters')
    .optional(),
});

export const createRescheduleRequestSchema = z.object({
  newSlotId: z.string().min(1, 'New Slot ID is required'),
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be under 500 characters')
    .optional(),
});

export const declineRescheduleRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be under 500 characters')
    .optional(),
});

export const chooseAlternativeSlotSchema = z.object({
  newSlotId: z.string().min(1, 'New Slot ID is required'),
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be under 500 characters')
    .optional(),
});

export const withdrawRescheduleRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Reason must be under 500 characters')
    .optional(),
});

export const doctorBulkRescheduleSchema = z.object({
  appointmentIds: z.array(z.string().uuid('Invalid appointment ID')).min(1),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  startTime: z.string().optional(),
  reason: z.string().trim().max(300).optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(300, 'Reason must be under 300 characters')
    .optional(),
});

export const getSlotsQuerySchema = z.object({
  startDate: z.string().optional(),
  days: z.coerce.number().min(1).max(31).optional().default(14),
  doctorId: z.string().optional(),
  doctor_id: z.string().optional(),
  locationId: z.string().nullable().optional(),
  location_id: z.string().nullable().optional(),
});


const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM (24-hour format)
const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

export const AvailabilityRuleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time_1: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  end_time_1: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  start_time_2: z
    .string()
    .regex(timeRegex, 'Must be in HH:MM format')
    .nullable()
    .optional(),
  end_time_2: z
    .string()
    .regex(timeRegex, 'Must be in HH:MM format')
    .nullable()
    .optional(),
  is_active: z.boolean(),
});

export const UpdateAvailabilitySchema = z.object({
  location_id: z.string().uuid('Invalid location ID').nullable().optional(),
  slot_duration_minutes: z.number().int().min(10).max(120).default(30),
  rules: z.array(AvailabilityRuleSchema).max(7),
});

export const AddBlockedDateSchema = z.object({
  blocked_date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
  start_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  end_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  reason: z.string().max(255).optional(),
});

export const AddCustomAvailabilitySchema = z.object({
  date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
  location_id: z.string().uuid('Invalid location ID'),
  start_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  end_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
});

export const UpdateCustomAvailabilitySchema = z.object({
  date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
  location_id: z.string().uuid('Invalid location ID'),
  start_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  end_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
});

export const UpdateBlockedDateSchema = z.object({
  blocked_date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
  start_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  end_time: z.string().regex(timeRegex, 'Must be in HH:MM format'),
  reason: z.string().max(255).optional(),
});
