import { z } from 'zod';

export const medicationSchema = z.object({
  medicine_name: z.string().trim().optional().nullable().default(''),
  dosage: z.string().trim().optional().nullable(),
  frequency: z.string().trim().optional().nullable(),
  route: z.string().trim().optional().nullable(),
  started_date: z.string().trim().optional().nullable(),
  stopped_date: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const previousDiseaseSchema = z.object({
  disease_name: z.string().trim().optional().nullable().default(''),
  diagnosis_date: z.string().trim().optional().nullable(),
  treatment_details: z.string().trim().optional().nullable(),
  current_status: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
  medications: z.array(medicationSchema).optional().default([]),
}).passthrough();

export const surgerySchema = z.object({
  surgery_name: z.string().trim().optional().nullable().default(''),
  surgery_date: z.string().trim().optional().nullable(),
  hospital_name: z.string().trim().optional().nullable(),
  surgeon_name: z.string().trim().optional().nullable(),
  outcome: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const hospitalAdmissionSchema = z.object({
  hospital_name: z.string().trim().optional().nullable().default(''),
  reason: z.string().trim().optional().nullable(),
  admission_date: z.string().trim().optional().nullable(),
  discharge_date: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const injuryAccidentSchema = z.object({
  description: z.string().trim().optional().nullable().default(''),
  date: z.string().trim().optional().nullable(),
  treatment: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const bloodTransfusionSchema = z.object({
  had_transfusion: z.union([z.string(), z.boolean(), z.null()]).optional(),
  transfusion_date: z.string().trim().optional().nullable(),
  number_of_units: z.union([z.coerce.number(), z.string(), z.null()]).optional(),
  reason: z.string().trim().optional().nullable(),
  reactions: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const allergiesSchema = z.object({
  medicine_allergies: z.string().trim().optional().nullable(),
  food_allergies: z.string().trim().optional().nullable(),
  other_allergies: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const specificConditionSchema = z.object({
  has_history: z.union([z.string(), z.boolean(), z.null()]).optional(),
  type: z.string().trim().optional().nullable(),
  duration: z.string().trim().optional().nullable(),
  current_treatment: z.string().trim().optional().nullable(),
  details: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const previousMedicalHistorySchema = z.object({
  chronic_diseases: z.array(z.string()).optional().default([]),
  previous_diseases: z.array(previousDiseaseSchema).optional().default([]),
  diabetes_history: specificConditionSchema.optional().nullable(),
  blood_pressure_history: specificConditionSchema.optional().nullable(),
  heart_disease_history: specificConditionSchema.optional().nullable(),
  kidney_disease_history: specificConditionSchema.optional().nullable(),
  liver_disease_history: specificConditionSchema.optional().nullable(),
  respiratory_disease_history: specificConditionSchema.optional().nullable(),
  hospital_admissions: z.array(hospitalAdmissionSchema).optional().default([]),
  surgeries: z.array(surgerySchema).optional().default([]),
  injuries_accidents: z.array(injuryAccidentSchema).optional().default([]),
  blood_transfusions: bloodTransfusionSchema.optional().nullable(),
  allergies: allergiesSchema.optional().nullable(),
  current_medications: z.array(medicationSchema).optional().default([]),
  previous_medications: z.array(medicationSchema).optional().default([]),
  ongoing_treatments: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const familyMemberHistorySchema = z.object({
  relationship: z.string().trim().optional().nullable().default('Family Member'),
  disease_name: z.string().trim().optional().nullable().default(''),
  age_at_diagnosis: z.union([z.coerce.number(), z.string(), z.null()]).optional(),
  current_health_status: z.string().trim().optional().nullable(),
  cause_of_death: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const familyMedicalHistorySchema = z.object({
  has_family_history: z.union([z.string(), z.boolean(), z.null()]).optional(),
  members: z.array(familyMemberHistorySchema).optional().default([]),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const reproductiveHistorySchema = z.object({
  is_applicable: z.union([z.boolean(), z.string(), z.null()]).optional().default(true),
  marital_status: z.string().trim().optional().nullable(),
  age_at_menarche: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  menstrual_status: z.string().trim().optional().nullable(),
  age_at_menopause: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_pregnancies: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_deliveries: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_children: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_living_children: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_miscarriages: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  number_of_abortions: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  age_at_first_childbirth: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  date_of_last_childbirth: z.string().trim().optional().nullable(),
  breastfeeding_history: z.union([z.string(), z.boolean(), z.null()]).optional(),
  breastfeeding_duration: z.string().trim().optional().nullable(),
  contraceptive_usage: z.string().trim().optional().nullable(),
  hormone_therapy_history: z.string().trim().optional().nullable(),
  infertility_treatment_history: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
}).passthrough();

export const lifestyleHistorySchema = z.object({
  smoking_status: z.string().trim().optional().nullable(),
  smoking_duration: z.string().trim().optional().nullable(),
  alcohol_consumption: z.string().trim().optional().nullable(),
  tobacco_usage: z.string().trim().optional().nullable(),
  chewing_tobacco: z.string().trim().optional().nullable(),
  diet_type: z.string().trim().optional().nullable(),
  physical_activity_level: z.string().trim().optional().nullable(),
  sleep_pattern: z.string().trim().optional().nullable(),
  occupational_exposure: z.string().trim().optional().nullable(),
  other_habits: z.string().trim().optional().nullable(),
}).passthrough();

export const currentMedicalInfoSchema = z.object({
  chief_complaint: z.string().trim().optional().nullable(),
  current_symptoms: z.string().trim().optional().nullable(),
  duration_of_symptoms: z.string().trim().optional().nullable(),
  pain_level: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  current_diagnosis: z.string().trim().optional().nullable(),
  differential_diagnosis: z.string().trim().optional().nullable(),
  treatment_strategy: z.string().trim().optional().nullable(),
  investigations_ordered: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
  care_goals: z.string().trim().optional().nullable(),
  clinical_observations: z.string().trim().optional().nullable(),
  height_cm: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  weight_kg: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  bmi: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  blood_pressure: z.string().trim().optional().nullable(),
  pulse_rate: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  temperature: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  oxygen_saturation: z.union([z.null(), z.coerce.number(), z.string()]).optional().nullable(),
  blood_sugar: z.string().trim().optional().nullable(),
  already_taking_tablets: z.string().trim().optional().nullable(),
  custom_vitals: z.any().optional().nullable(),
}).passthrough();

export const createPatientMedicalHistorySchema = z.object({
  recorded_date: z.string().trim().optional().nullable(),
  recorded_by_name: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  previous_medical_history: previousMedicalHistorySchema.optional().nullable(),
  family_medical_history: familyMedicalHistorySchema.optional().nullable(),
  reproductive_history: reproductiveHistorySchema.optional().nullable(),
  lifestyle_history: lifestyleHistorySchema.optional().nullable(),
  lifecycle_history: lifestyleHistorySchema.optional().nullable(),
  current_medical_info: currentMedicalInfoSchema.optional().nullable(),
}).passthrough();

export const updatePatientMedicalHistorySchema = z.object({
  recorded_date: z.string().trim().optional().nullable(),
  recorded_by_name: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  previous_medical_history: previousMedicalHistorySchema.optional().nullable(),
  family_medical_history: familyMedicalHistorySchema.optional().nullable(),
  reproductive_history: reproductiveHistorySchema.optional().nullable(),
  lifestyle_history: lifestyleHistorySchema.optional().nullable(),
  lifecycle_history: lifestyleHistorySchema.optional().nullable(),
  current_medical_info: currentMedicalInfoSchema.optional().nullable(),
}).passthrough();

export const createMedicalDocumentSchema = z.object({
  medical_history_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional().nullable(),
  document_type: z.string().trim().min(1, 'Document type is required'),
  title: z.string().trim().min(1, 'Document title is required'),
  file_name: z.string().trim().min(1, 'File name is required'),
  file_url: z.string().trim().min(1, 'File URL is required'),
  storage_key: z.string().trim().optional().nullable(),
  file_type: z.string().trim().optional().nullable(),
  file_size: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  document_date: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).passthrough();
