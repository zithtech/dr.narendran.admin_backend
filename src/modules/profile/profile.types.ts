export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
}

export interface PatientMedicalInfo {
  allergies: string[];
  currentMedication: string[];
  pastMedication: string[];
  injuries: string[];
  surgeries: string[];
}

export interface PatientProfile {
  userId: string;
  fullName: string;
  email: string;
  mobileNumber: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  heightCm: number | null;
  weightKg: number | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  profileImageUrl: string | null;
  emergencyContacts: EmergencyContact[];
  basicMedicalInfo: PatientMedicalInfo;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileData {
  fullName?: string | undefined;
  email?: string | undefined;
  mobileNumber?: string | undefined;
  dateOfBirth?: string | null | undefined;
  date_of_birth?: string | null | undefined;
  dob?: string | null | undefined;
  gender?: Gender | null | undefined;
  heightCm?: number | string | null | undefined;
  height_cm?: number | string | null | undefined;
  weightKg?: number | string | null | undefined;
  weight_kg?: number | string | null | undefined;
  maritalStatus?: string | null | undefined;
  marital_status?: string | null | undefined;
  bloodGroup?: string | null | undefined;
  blood_group?: string | null | undefined;
  addressLine1?: string | null | undefined;
  addressLine2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  postalCode?: string | null | undefined;
  country?: string | null | undefined;
  emergencyContacts?: EmergencyContact[] | undefined;
}

export interface UpdateMedicalInfoData {
  allergies?: string[] | undefined;
  currentMedication?: string[] | undefined;
  pastMedication?: string[] | undefined;
  injuries?: string[] | undefined;
  surgeries?: string[] | undefined;
}
