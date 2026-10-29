export type TimelineEventType =
  | 'CONSULTATION'
  | 'PRESCRIPTION'
  | 'MEDICINE_STARTED'
  | 'MEDICINE_CHANGED'
  | 'MEDICINE_STOPPED'
  | 'LAB_TEST_ORDERED'
  | 'LAB_REPORT'
  | 'MEDICAL_RECORD'
  | 'IMAGING'
  | 'DOCTOR_NOTE'
  | 'APPOINTMENT'
  | 'FOLLOW_UP';

export type TimelineFilterType =
  | 'ALL'
  | 'CONSULTATION'
  | 'PRESCRIPTION'
  | 'MEDICINE'
  | 'INVESTIGATION'
  | 'REPORT'
  | 'MEDICAL_RECORD'
  | 'IMAGING'
  | 'DOCTOR_NOTE'
  | 'APPOINTMENT'
  | 'FOLLOW_UP'
  | TimelineEventType;

export interface TimelineDoctorSummary {
  id: string;
  name: string;
  specialization: string;
}

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurred_at: string;
  title: string;
  summary: string;
  reference_id: string;
  reference_type:
    | 'appointment'
    | 'prescription'
    | 'medicine'
    | 'lab_test'
    | 'lab_report'
    | 'medical_record';
  doctor: TimelineDoctorSummary | null;
  details: Record<string, unknown>;
}

export interface PatientTimelineHeader {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  blood_group?: string | null | undefined;
}

export interface HealthSummary {
  primary_condition: string;
  active_conditions: string[];
  active_medications: string[];
  consultations_count: number;
  prescriptions_count: number;
  investigations_count: number;
  medical_records_count: number;
  last_consultation: Record<string, unknown> | null;
  upcoming_follow_up: Record<string, unknown> | null;
}

export interface TimelinePagination {
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
}

export interface MedicalTimelineResponse {
  patient: PatientTimelineHeader;
  summary: HealthSummary;
  timeline: TimelineEvent[];
  pagination: TimelinePagination;
}

export interface GetMedicalTimelineQuery {
  page?: number | undefined;
  limit?: number | undefined;
  type?: TimelineFilterType | undefined;
  from_date?: string | undefined;
  to_date?: string | undefined;
}

export interface MedicineAdherenceItem {
  id: string;
  medicine_name: string;
  scheduled_date: string;
  scheduled_time: string | null;
  dose_time_of_day: string | null;
  status: string;
  taken_at: string | null;
}

export interface MedicalHistorySummary {
  active_conditions: string[];
  active_medications: string[];
  allergies: string[];
  important_alerts: string[];
  last_consultation: Record<string, unknown> | null;
  upcoming_follow_up: Record<string, unknown> | null;
}

export interface MedicalHistoryResponse {
  patient: {
    id: string;
    name: string;
    date_of_birth: string | null;
    age: number | null;
    gender: string | null;
    blood_group: string | null;
  };
  summary: MedicalHistorySummary;
  consultations: ConsultationSummaryItem[];
  diagnoses: DiagnosisSummaryItem[];
  prescriptions: PrescriptionSummaryItem[];
  medications: MedicationSummaryItem[];
  investigations: InvestigationSummaryItem[];
  medical_records: MedicalRecordSummaryItem[];
  appointments: AppointmentSummaryItem[];
  medicine_adherence: MedicineAdherenceItem[];
  timeline: TimelineEvent[];
  pagination?: TimelinePagination | undefined;
}


// ==========================================
// SECOND OPINION MEDICAL SUMMARY TYPES
// ==========================================

export type MedicalSummarySection =
  | 'HEALTH_SUMMARY'
  | 'CONSULTATIONS'
  | 'DIAGNOSES'
  | 'PRESCRIPTIONS'
  | 'MEDICINES'
  | 'INVESTIGATIONS'
  | 'LAB_REPORTS'
  | 'MEDICAL_RECORDS'
  | 'APPOINTMENTS'
  | 'MEDICINE_TRACKING'
  | 'RECENT_ADVICE';

export interface MedicalSummaryQuery {
  from_date?: string | undefined;
  to_date?: string | undefined;
  sections?: string[] | string | undefined;
}

export interface SecondOpinionRequest {
  date_range?: {
    from?: string | undefined;
    to?: string | undefined;
  } | undefined;
  from_date?: string | undefined;
  to_date?: string | undefined;
  sections?: MedicalSummarySection[] | undefined;
}

export interface PatientSummaryDetail {
  id: string;
  name: string;
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  blood_group: string | null;
  height_cm: number | null;
  weight_kg: number | null;
}

export interface ClinicalSummary {
  primary_condition: string;
  current_treatment: string;
  current_medications: string[];
  allergies: string[];
  important_alerts: string[];
}

export interface ConsultationSummaryItem {
  id: string;
  date: string;
  doctor: TimelineDoctorSummary;
  purpose: string | null;
  diagnosis: string | null;
  doctor_notes: string | null;
  advice: string | null;
  status: string;
}

export interface DiagnosisSummaryItem {
  diagnosis: string;
  diagnosed_date: string;
  doctor: TimelineDoctorSummary | null;
  reference_id: string;
}

export interface PrescriptionSummaryItem {
  id: string;
  date: string;
  doctor: TimelineDoctorSummary;
  status: string;
  additional_notes?: string | null | undefined;
  medicine_count: number;
  prescription_url?: string | null | undefined;
  medicines: Array<{
    name: string;
    dosage?: string | null | undefined;
    frequency?: string | null | undefined;
    duration?: string | null | undefined;
    instructions?: string | null | undefined;
    food_instruction?: string | null | undefined;
  }>;
}

export interface MedicationSummaryItem {
  name: string;
  dosage?: string | null | undefined;
  frequency?: string | null | undefined;
  duration?: string | null | undefined;
  food_instruction?: string | null | undefined;
  instructions?: string | null | undefined;
  started_date: string;
  status: string;
  prescribed_by: TimelineDoctorSummary | null;
}

export interface InvestigationSummaryItem {
  id: string;
  test_name: string;
  ordered_date: string;
  instructions?: string | null | undefined;
  status: 'REPORT_AVAILABLE' | 'AWAITING_RESULT';
  doctor: TimelineDoctorSummary | null;
  report?: {
    id: string;
    file_name: string;
    report_date: string;
    document_url?: string | undefined;
  } | null | undefined;
}

export interface LabReportSummaryItem {
  id: string;
  test_name: string;
  file_name: string;
  file_type: string;
  report_date: string;
  document_url: string;
  notes?: string | null | undefined;
  is_external: boolean;
}

export interface MedicalRecordSummaryItem {
  id: string;
  title: string;
  record_type: string;
  record_date: string;
  document_url?: string | undefined;
  file_name?: string | undefined;
  doctor?: TimelineDoctorSummary | null | undefined;
  notes?: string | null | undefined;
}

export interface AppointmentSummaryItem {
  id: string;
  date: string;
  time: string;
  doctor: TimelineDoctorSummary;
  purpose: string | null;
  status: string;
}

export interface AdviceSummaryItem {
  date: string;
  advice: string;
  doctor: TimelineDoctorSummary;
  reference_id: string;
}

export interface CurrentStatusSummary {
  last_visit_date: string | null;
  next_appointment_date: string | null;
  adherence_rate_pct: number | null;
}

export interface SecondOpinionSummaryResponse {
  patient: PatientSummaryDetail;
  clinical_summary: ClinicalSummary;
  consultations?: ConsultationSummaryItem[] | undefined;
  diagnoses?: DiagnosisSummaryItem[] | undefined;
  prescriptions?: PrescriptionSummaryItem[] | undefined;
  medications?: MedicationSummaryItem[] | undefined;
  investigations?: InvestigationSummaryItem[] | undefined;
  lab_reports?: LabReportSummaryItem[] | undefined;
  medical_records?: MedicalRecordSummaryItem[] | undefined;
  appointments?: AppointmentSummaryItem[] | undefined;
  recent_advice?: AdviceSummaryItem[] | undefined;
  current_status: CurrentStatusSummary;
}
