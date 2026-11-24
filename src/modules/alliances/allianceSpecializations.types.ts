export interface AllianceDoctorSpecialization {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface CreateAllianceSpecializationInput {
  name: string;
  description?: string | null | undefined;
  status?: 'ACTIVE' | 'INACTIVE' | string | undefined;
}

export interface UpdateAllianceSpecializationInput {
  name?: string | undefined;
  description?: string | null | undefined;
  status?: 'ACTIVE' | 'INACTIVE' | string | undefined;
}

