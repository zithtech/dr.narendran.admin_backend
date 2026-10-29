export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentSession = 'morning' | 'afternoon' | 'evening';

export interface DoctorProfile {
  userId: string;
  fullName: string;
  qualifications?: string | undefined;
  specialty?: string | undefined;
  clinicName?: string | undefined;
  clinicAddress?: string | undefined;
  contactPhone?: string | undefined;
  contactEmail?: string | undefined;
  profileImageUrl?: string | undefined;
}

export interface LocationInfo {
  id: string;
  name: string;
  address?: string | null | undefined;
  map_link?: string | null | undefined;
  is_primary?: boolean | undefined;
}

export interface AppointmentSlot {
  id: string;
  doctorId: string;
  slotTime: string;
  session: AppointmentSession;
  maxCapacity: number;
  isBooked: boolean;
  start_time?: string | undefined;
  end_time?: string | undefined;
  location_id?: string | undefined;
  locationId?: string | undefined;
  location_name?: string | undefined;
  location_address?: string | undefined;
  location?: LocationInfo | undefined;
  source?: 'custom' | 'regular' | undefined;
}

export interface DateSlotSummary {
  date: string; // YYYY-MM-DD
  dayName: string; // e.g. Mon, Tue
  dayNumber: number; // e.g. 18
  availableCount: number;
  isDoctorAvailable?: boolean | undefined;
  blockedReason?: string | undefined;
  locationId?: string | undefined;
  locationName?: string | undefined;
  locationAddress?: string | undefined;
  location?: LocationInfo | undefined;
  source?: 'custom' | 'regular' | 'combined' | undefined;
  slots: AppointmentSlot[];
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  slotId?: string | undefined;
  scheduledStart: string;
  scheduledEnd: string;
  tokenNumber: string;
  purpose: string;
  doctor_id?: string | undefined;
  patientNote?: string | undefined;
  patientName?: string | undefined;
  patientPhone?: string | undefined;
  status: AppointmentStatus;
  rescheduleReason?: string | undefined;
  cancellationReason?: string | undefined;
  cancelledBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
  doctor?: DoctorProfile | undefined;
}

export interface CreateAppointmentPayload {
  slotId: string;
  purpose: string;
  patientNote?: string | undefined;
  patientName?: string | undefined;
  patientPhone?: string | undefined;
  doctorId?: string | undefined;
  doctor_id?: string | undefined;
}

export type CreateAppointmentInput = CreateAppointmentPayload;

export interface RescheduleAppointmentInput {
  newSlotId: string;
  reason?: string | undefined;
}

export interface CancelAppointmentInput {
  reason?: string | undefined;
}

export interface DoctorAvailabilityItem {
  start_time: string;
  end_time: string;
  slot_length?: number | undefined;
  status?: string | undefined;
  is_available?: boolean | undefined;
  location_id?: string | undefined;
  locationId?: string | undefined;
  location_name?: string | undefined;
  location_address?: string | undefined;
  location?: LocationInfo | undefined;
  source?: 'custom' | 'regular' | undefined;
}

export interface DoctorAvailabilityResult {
  source: 'custom' | 'regular' | 'combined';
  availability: DoctorAvailabilityItem[];
}

export type RescheduleRequestStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export interface AppointmentRescheduleRequest {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  proposedSlotId: string;
  proposedStart: string;
  proposedEnd: string;
  reason?: string | undefined;
  status: RescheduleRequestStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastReminderSentAt?: string | undefined;
  reminderCount?: number | undefined;
  appointment?: Appointment | undefined;
  doctor?: DoctorProfile | undefined;
}

export interface DoctorRescheduleRequestItem {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientGender?: string | undefined;
  patientProfileImageUrl?: string | undefined;
  proposedSlotId: string;
  proposedStart: string;
  proposedEnd: string;
  origScheduledStart: string;
  origScheduledEnd: string;
  tokenNumber?: number | string | null | undefined;
  appointmentPurpose?: string | null | undefined;
  reason?: string | undefined;
  status: RescheduleRequestStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  lastReminderSentAt?: string | undefined;
  reminderCount: number;
}

export interface CreateRescheduleRequestInput {
  newSlotId: string;
  reason?: string | undefined;
}

export interface ChooseAlternativeSlotInput {
  newSlotId: string;
  reason?: string | undefined;
}

export interface WithdrawRescheduleRequestInput {
  reason?: string | undefined;
}

