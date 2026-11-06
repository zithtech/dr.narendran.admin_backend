export type StaffStatus = 'ACTIVE' | 'INACTIVE';

export interface StaffDocument {
  id: string;
  name: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface StaffMember {
  id: string;
  staffCode: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  role: string;
  hospitalId?: string;
  hospitalName?: string;
  branchId?: string;
  branchName?: string;
  shiftTiming: string;
  customShiftDetails?: string;
  joiningDate: string;
  status: StaffStatus;
  notes?: string;
  documents: StaffDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateStaffInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  role: string;
  hospitalId?: string;
  hospital_id?: string;
  branchId?: string;
  branch_id?: string;
  shiftTiming?: string;
  shift_timing?: string;
  customShiftDetails?: string;
  custom_shift_details?: string;
  joiningDate?: string;
  joining_date?: string;
  status?: StaffStatus;
  notes?: string;
}

export interface UpdateStaffInput {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  role?: string;
  hospitalId?: string;
  hospital_id?: string;
  branchId?: string;
  branch_id?: string;
  shiftTiming?: string;
  shift_timing?: string;
  customShiftDetails?: string;
  custom_shift_details?: string;
  joiningDate?: string;
  joining_date?: string;
  status?: StaffStatus;
  notes?: string;
}

export interface StaffFilterParams {
  search?: string;
  role?: string;
  hospitalId?: string;
  branchId?: string;
  shiftTiming?: string;
  status?: StaffStatus | 'ALL';
}

