export interface PreviousDisease {
  disease_name: string;
  diagnosis_date?: string | null;
  treatment_details?: string | null;
  current_status?: string | null; // 'Active' | 'Resolved' | 'In Remission' | 'Under Control' | 'Unknown'
  remarks?: string | null;
  medications?: Medication[];
}

export interface Surgery {
  surgery_name: string;
  surgery_date?: string | null;
  hospital_name?: string | null;
  surgeon_name?: string | null;
  remarks?: string | null;
}

export interface HospitalAdmission {
  hospital_name: string;
  reason: string;
  admission_date?: string | null;
  discharge_date?: string | null;
  remarks?: string | null;
}

export interface InjuryAccident {
  description: string;
  date?: string | null;
  treatment?: string | null;
  remarks?: string | null;
}

export interface BloodTransfusion {
  had_transfusion?: string | boolean | null; // 'Yes' | 'No' | 'Unknown'
  transfusion_date?: string | null;
  number_of_units?: number | string | null;
  reason?: string | null;
  reactions?: string | null;
  remarks?: string | null;
}

export interface Allergies {
  medicine_allergies?: string | null;
  food_allergies?: string | null;
  other_allergies?: string | null;
  remarks?: string | null;
}

export interface Medication {
  medicine_name: string;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  started_date?: string | null;
  stopped_date?: string | null;
  reason?: string | null;
  remarks?: string | null;
}

export interface SpecificConditionHistory {
  has_history?: string | boolean | null; // 'Yes' | 'No' | 'Unknown'
  type?: string | null;
  duration?: string | null;
  current_treatment?: string | null;
  details?: string | null;
  remarks?: string | null;
}

export interface PreviousMedicalHistory {
  chronic_diseases?: string[];
  previous_diseases?: PreviousDisease[];
  diabetes_history?: SpecificConditionHistory;
  blood_pressure_history?: SpecificConditionHistory;
  heart_disease_history?: SpecificConditionHistory;
  kidney_disease_history?: SpecificConditionHistory;
  liver_disease_history?: SpecificConditionHistory;
  respiratory_disease_history?: SpecificConditionHistory;
  hospital_admissions?: HospitalAdmission[];
  surgeries?: Surgery[];
  injuries_accidents?: InjuryAccident[];
  blood_transfusions?: BloodTransfusion;
  allergies?: Allergies;
  current_medications?: Medication[];
  previous_medications?: Medication[];
  ongoing_treatments?: string | null;
  remarks?: string | null;
}

export interface FamilyMemberHistory {
  relationship: string; // 'Father' | 'Mother' | 'Brother' | 'Sister' | 'Grandparents' | etc.
  disease_name: string;
  age_at_diagnosis?: number | string | null;
  current_health_status?: string | null; // 'Alive - Healthy' | 'Alive - Managing Condition' | 'Alive - Critical' | 'Deceased' | 'Unknown'
  cause_of_death?: string | null;
  remarks?: string | null;
}

export interface FamilyMedicalHistory {
  has_family_history?: string | boolean | null; // 'Yes' | 'No' | 'Unknown'
  members?: FamilyMemberHistory[];
  remarks?: string | null;
}

export interface ReproductiveHistory {
  is_applicable?: boolean;
  marital_status?: string | null;
  age_at_menarche?: number | string | null;
  menstrual_status?: string | null; // 'Regular' | 'Irregular' | 'Menopause' | 'Not Applicable' | 'Unknown'
  age_at_menopause?: number | string | null;
  number_of_pregnancies?: number | string | null;
  number_of_deliveries?: number | string | null;
  number_of_children?: number | string | null;
  number_of_living_children?: number | string | null;
  number_of_miscarriages?: number | string | null;
  number_of_abortions?: number | string | null;
  age_at_first_childbirth?: number | string | null;
  date_of_last_childbirth?: string | null;
  breastfeeding_history?: string | boolean | null; // 'Yes' | 'No' | 'Not Applicable' | 'Unknown'
  breastfeeding_duration?: string | null;
  contraceptive_usage?: string | null;
  hormone_therapy_history?: string | null;
  infertility_treatment_history?: string | null;
  remarks?: string | null;
}

export interface LifestyleHistory {
  smoking_status?: string | null; // 'Never' | 'Former' | 'Current' | 'Unknown'
  smoking_duration?: string | null;
  alcohol_consumption?: string | null; // 'Never' | 'Occasionally' | 'Regularly' | 'Former' | 'Unknown'
  tobacco_usage?: string | null;
  chewing_tobacco?: string | null;
  diet_type?: string | null; // 'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian' | 'Vegan' | 'Other'
  physical_activity_level?: string | null; // 'Sedentary' | 'Moderate' | 'Active' | 'Very Active' | 'Unknown'
  sleep_pattern?: string | null;
  occupational_exposure?: string | null;
  other_habits?: string | null;
}

export interface CurrentMedicalInfo {
  chief_complaint?: string | null;
  current_symptoms?: string | null;
  duration_of_symptoms?: string | null;
  pain_level?: number | string | null; // 0–10
  current_diagnosis?: string | null;
  differential_diagnosis?: string | null;
  treatment_strategy?: string | null;
  investigations_ordered?: string[] | string | null;
  care_goals?: string | null;
  clinical_observations?: string | null;
  height_cm?: number | string | null;
  weight_kg?: number | string | null;
  bmi?: number | string | null;
  blood_pressure?: string | null;
  pulse_rate?: number | string | null;
  temperature?: number | string | null;
  oxygen_saturation?: number | string | null;
}

export interface PatientMedicalHistoryRecord {
  id: string;
  patient_id: string;
  recorded_date: string;
  recorded_by_id?: string | null;
  recorded_by_name?: string | null;
  notes?: string | null;
  previous_medical_history: PreviousMedicalHistory;
  family_medical_history: FamilyMedicalHistory;
  reproductive_history: ReproductiveHistory;
  lifestyle_history: LifestyleHistory;
  current_medical_info: CurrentMedicalInfo;
  created_at: string;
  updated_at: string;
}

export const MEDICAL_DOCUMENT_TYPES = [
  'Previous Medical Report',
  'Laboratory Report',
  'Scan Report',
  'X-Ray Report',
  'Prescription Document',
  'Discharge Summary',
  'Surgery Report',
  'Other Medical Document',
] as const;

export type MedicalDocumentType = (typeof MEDICAL_DOCUMENT_TYPES)[number];

export interface PatientMedicalDocument {
  id: string;
  patient_id: string;
  medical_history_id?: string | null;
  document_type: MedicalDocumentType | string;
  title: string;
  file_name: string;
  file_url: string;
  storage_key?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  document_date?: string | null;
  notes?: string | null;
  uploaded_by_id?: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
  updated_at: string;
}
