import { z } from 'zod';

export enum NotificationType {
  // Patient — appointments
  APPOINTMENT_BOOKED = 'APPOINTMENT_BOOKED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  DOCTOR_RESCHEDULE_PROPOSED = 'DOCTOR_RESCHEDULE_PROPOSED',
  DOCTOR_RESCHEDULE_WITHDRAWN = 'DOCTOR_RESCHEDULE_WITHDRAWN',
  DOCTOR_RESCHEDULE_EXPIRED = 'DOCTOR_RESCHEDULE_EXPIRED',
  DOCTOR_MESSAGE = 'DOCTOR_MESSAGE',

  // Patient — prescriptions & records
  PRESCRIPTION_CREATED = 'PRESCRIPTION_CREATED',
  PRESCRIPTION_AVAILABLE = 'PRESCRIPTION_AVAILABLE',
  PRESCRIPTION_REVISED = 'PRESCRIPTION_REVISED',
  LAB_REPORT_AVAILABLE = 'LAB_REPORT_AVAILABLE',
  MEDICAL_RECORD_AVAILABLE = 'MEDICAL_RECORD_AVAILABLE',
  MEDICAL_RECORD_UPDATED = 'MEDICAL_RECORD_UPDATED',

  // Patient — medicines & orders
  MEDICINE_REMINDER = 'MEDICINE_REMINDER',
  MEDICINE_DOSE_REMINDER = 'MEDICINE_DOSE_REMINDER',
  DOSE_NOT_TAKEN_REMINDER = 'DOSE_NOT_TAKEN_REMINDER',
  MISSED_DOSE_NOTIFICATION = 'MISSED_DOSE_NOTIFICATION',
  MEDICINE_SUPPLY_LOW = 'MEDICINE_SUPPLY_LOW',
  DAILY_MEDICINE_SCHEDULE = 'DAILY_MEDICINE_SCHEDULE',
  MEDICINE_ORDER_CONFIRMED = 'MEDICINE_ORDER_CONFIRMED',
  MEDICINE_ORDER_PROCESSING = 'MEDICINE_ORDER_PROCESSING',
  MEDICINE_ORDER_SHIPPED = 'MEDICINE_ORDER_SHIPPED',
  MEDICINE_ORDER_DELIVERED = 'MEDICINE_ORDER_DELIVERED',
  MEDICINE_ORDER_CANCELLED = 'MEDICINE_ORDER_CANCELLED',
  MEDICINE_ORDER_REFUNDED = 'MEDICINE_ORDER_REFUNDED',
  FOLLOW_UP_REMINDER = 'FOLLOW_UP_REMINDER',

  // Doctor
  NEW_APPOINTMENT = 'NEW_APPOINTMENT',
  PATIENT_MESSAGE = 'PATIENT_MESSAGE',
  NEW_PATIENT = 'NEW_PATIENT',
  PRESCRIPTION_REQUIRED = 'PRESCRIPTION_REQUIRED',
  FOLLOW_UP_BOOKED = 'FOLLOW_UP_BOOKED',
  PATIENT_NON_ADHERENCE_ALERT = 'PATIENT_NON_ADHERENCE_ALERT',
  RESCHEDULE_CONFIRMED = 'RESCHEDULE_CONFIRMED',
  RESCHEDULE_DECLINED = 'RESCHEDULE_DECLINED',
  RESCHEDULE_ALTERNATIVE_BOOKED = 'RESCHEDULE_ALTERNATIVE_BOOKED',

  // Chat
  NEW_CHAT_MESSAGE = 'NEW_CHAT_MESSAGE',
}


export enum PlatformType {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
}

export enum AppType {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
}

export type DeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'PARTIAL'
  | 'SKIPPED';

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  platform: z.nativeEnum(PlatformType).optional().default(PlatformType.ANDROID),
  appType: z.nativeEnum(AppType).optional().default(AppType.PATIENT),
  deviceId: z.string().optional().nullable(),
});

export const unregisterDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type UnregisterDeviceTokenInput = z.infer<typeof unregisterDeviceTokenSchema>;

export interface DeviceTokenRecord {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceId: string | null;
  appType: string;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPayload {
  type: NotificationType | string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  route?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string | null | undefined;
}

export interface InAppNotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: Date | null;
  idempotencyKey?: string | null;
  deliveryStatus?: DeliveryStatus;
  deliveredAt?: Date | null;
  deliveryAttempts?: number;
  failureReason?: string | null;
  createdAt: Date;
}

export interface SendNotificationResult {
  sentCount: number;
  failureCount: number;
  deactivatedTokens: string[];
}


export const testNotificationSchema = z.object({
  title: z.string().optional().default('Test Notification'),
  body: z.string().optional().default('Firebase notification is working!'),
  data: z.record(z.string(), z.unknown()).optional().default({ type: 'GENERAL' }),
});

export type TestNotificationInput = z.infer<typeof testNotificationSchema>;

export const sendNotificationSchema = z.object({
  recipientType: z.enum(['PATIENT', 'DOCTOR']).default('PATIENT'),
  recipientId: z.string().min(1, 'recipientId is required'),
  type: z.string().optional().default('GENERAL'),
  title: z.string().min(1, 'title is required'),
  body: z.string().min(1, 'body is required'),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
