export type ShiftType = 'REGULAR' | 'ROTATIONAL' | 'NIGHT' | 'ON_CALL' | 'SPLIT';
export type UserType = 'ADMIN' | 'DOCTOR' | 'STAFF';
export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'LATE'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'ON_DUTY_ROUNDS';

export type PunchType = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END';
export type PunchMethod = 'WEB_PORTAL' | 'MOBILE_APP' | 'BIOMETRIC' | 'GEO_FENCE' | 'MANUAL_ADMIN';
export type RegularizationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RegularizationType =
  | 'MISSED_PUNCH_IN'
  | 'MISSED_PUNCH_OUT'
  | 'EMERGENCY_ON_DUTY'
  | 'CORRECTION';

export interface GeoLocationPayload {
  lat?: number | undefined;
  lng?: number | undefined;
  accuracy?: number | undefined;
  address?: string | undefined;
  verified?: boolean | undefined;
}

export interface AttendanceShift {
  id: string;
  tenant_id: string;
  hospital_id: string;
  branch_id?: string | null | undefined;
  name: string;
  code: string;
  shift_type: ShiftType;
  applicable_for: 'ALL' | 'DOCTOR' | 'STAFF';
  start_time: string; // 'HH:MM:SS'
  end_time: string;   // 'HH:MM:SS'
  grace_period_minutes: number;
  half_day_threshold_hours: number;
  full_day_threshold_hours: number;
  color_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserShiftAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  shift_id: string;
  user_type: UserType;
  day_of_week?: number | null | undefined;
  specific_date?: string | null | undefined;
  effective_from: string;
  effective_to?: string | null | undefined;
  assigned_by?: string | null | undefined;
  shift?: AttendanceShift | undefined;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  hospital_id: string;
  branch_id?: string | null | undefined;
  user_id: string;
  user_type: UserType;
  user_name?: string | undefined;
  user_role?: string | undefined;
  department?: string | undefined;
  user_avatar?: string | undefined;
  date: string; // 'YYYY-MM-DD'
  shift_id?: string | null | undefined;
  shift?: AttendanceShift | null | undefined;
  check_in_time?: string | null | undefined;
  check_out_time?: string | null | undefined;
  total_working_minutes: number;
  total_break_minutes: number;
  overtime_minutes: number;
  status: AttendanceStatus;
  check_in_method: PunchMethod;
  check_in_ip?: string | null | undefined;
  check_in_device?: string | null | undefined;
  check_in_location?: GeoLocationPayload | null | undefined;
  check_out_location?: GeoLocationPayload | null | undefined;
  is_manual_entry: boolean;
  manual_reason?: string | null | undefined;
  approved_by?: string | null | undefined;
  approved_by_name?: string | null | undefined;
  remarks?: string | null | undefined;
  punches?: AttendancePunch[] | undefined;
  created_at: string;
  updated_at: string;
}

export interface AttendancePunch {
  id: string;
  tenant_id: string;
  attendance_record_id: string;
  punch_type: PunchType;
  punched_at: string;
  ip_address?: string | null | undefined;
  device_info?: string | null | undefined;
  location?: GeoLocationPayload | null | undefined;
  verification_status: 'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'FLAGGED';
  created_at: string;
}

export interface AttendanceRegularization {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name?: string | undefined;
  user_role?: string | undefined;
  attendance_record_id?: string | null | undefined;
  date: string;
  request_type: RegularizationType;
  requested_check_in?: string | null | undefined;
  requested_check_out?: string | null | undefined;
  reason: string;
  status: RegularizationStatus;
  reviewed_by?: string | null | undefined;
  reviewed_by_name?: string | null | undefined;
  reviewed_at?: string | null | undefined;
  rejection_reason?: string | null | undefined;
  created_at: string;
}

export interface AttendanceDashboardSummary {
  date: string;
  total_doctors: number;
  active_doctors_on_duty: number;
  total_staff: number;
  active_staff_on_duty: number;
  late_arrivals_today: number;
  absent_today: number;
  on_leave_today: number;
  department_breakdown: Array<{
    department: string;
    total: number;
    present: number;
    percentage: number;
  }>;
  recent_punches: Array<{
    user_id: string;
    user_name: string;
    user_type: UserType;
    role: string;
    avatar?: string | undefined;
    punch_type: PunchType;
    punched_at: string;
    shift_name: string;
    status: AttendanceStatus;
  }>;
}

export interface AttendanceFilterParams {
  date?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  userType?: UserType | 'ALL' | undefined;
  role?: string | undefined;
  department?: string | undefined;
  shiftId?: string | undefined;
  status?: AttendanceStatus | 'ALL' | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}
