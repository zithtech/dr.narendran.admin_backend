import type {
  AttendanceDashboardSummary,
  AttendanceFilterParams,
  AttendancePunch,
  AttendanceRecord,
  AttendanceRegularization,
  AttendanceShift,
  AttendanceStatus,
  GeoLocationPayload,
  PunchMethod,
  PunchType,
  RegularizationStatus,
  RegularizationType,
  UserType,
} from './attendance.types.js';
import * as repository from './attendance.repository.js';
import { BadRequestError, NotFoundError } from '@/http/errors.js';

function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getTodayStatus(
  userId: string,
  userType: UserType = 'STAFF',
  tenantId = 'default'
): Promise<{
  isCheckedIn: boolean;
  isOnBreak: boolean;
  record: AttendanceRecord | null;
  activeShift: AttendanceShift | null;
  user: {
    id: string;
    name: string;
    role: string;
    department: string;
    specialization?: string | undefined;
    email: string;
    userType: UserType;
  } | null;
  punches: AttendancePunch[];
  elapsedWorkingMinutes: number;
}> {
  const todayStr = getTodayDateStr();
  const [record, userProfile] = await Promise.all([
    repository.findAttendanceRecord(userId, todayStr, tenantId),
    repository.getUserProfile(userId),
  ]);

  const effectiveUserType = userProfile?.userType || userType;
  const activeShift = await repository.getUserShiftForDate(userId, todayStr, effectiveUserType);

  if (!record) {
    return {
      isCheckedIn: false,
      isOnBreak: false,
      record: null,
      activeShift,
      user: userProfile,
      punches: [],
      elapsedWorkingMinutes: 0,
    };
  }

  const punches = await repository.getPunchesForRecord(record.id);

  let isCheckedIn = false;
  let isOnBreak = false;

  if (punches.length > 0) {
    const lastPunch = punches[punches.length - 1];
    if (lastPunch) {
      if (lastPunch.punch_type === 'IN' || lastPunch.punch_type === 'BREAK_END') {
        isCheckedIn = true;
      } else if (lastPunch.punch_type === 'BREAK_START') {
        isCheckedIn = true;
        isOnBreak = true;
      } else if (lastPunch.punch_type === 'OUT') {
        isCheckedIn = false;
      }
    }
  }

  // Calculate live elapsed working minutes if currently checked in
  let elapsedWorkingMinutes = record.total_working_minutes;
  if (isCheckedIn && !isOnBreak && record.check_in_time) {
    const checkInTime = new Date(record.check_in_time).getTime();
    const nowTime = Date.now();
    const liveMinutes = Math.max(0, Math.floor((nowTime - checkInTime) / 60000));
    elapsedWorkingMinutes = Math.max(0, liveMinutes - record.total_break_minutes);
  }

  return {
    isCheckedIn,
    isOnBreak,
    record,
    activeShift,
    user: userProfile,
    punches,
    elapsedWorkingMinutes,
  };
}

export async function punch(data: {
  userId: string;
  userType: UserType;
  punchType: PunchType;
  method?: PunchMethod | undefined;
  location?: GeoLocationPayload | null | undefined;
  ip?: string | null | undefined;
  device?: string | null | undefined;
  hospitalId?: string | undefined;
  tenantId?: string | undefined;
}): Promise<{
  punch: AttendancePunch;
  record: AttendanceRecord;
  message: string;
}> {
  const { userId, userType, punchType, location, ip, device, hospitalId, tenantId = 'default' } = data;
  const todayStr = getTodayDateStr();

  // Resolve user profile to ensure accurate role categorization (ADMIN, DOCTOR, STAFF)
  const userProfile = await repository.getUserProfile(userId);
  const effectiveUserType: UserType = userProfile?.userType || userType || 'STAFF';

  // 1. Get or create today's attendance record
  let record = await repository.findAttendanceRecord(userId, todayStr, tenantId);
  const activeShift = await repository.getUserShiftForDate(userId, todayStr, effectiveUserType);

  const now = new Date();

  if (punchType === 'IN') {
    if (record && record.check_in_time && !record.check_out_time) {
      throw new BadRequestError('You are already checked in for today.');
    }

    // Determine initial status based on shift start and grace period
    let initialStatus: AttendanceStatus = 'PRESENT';
    if (activeShift) {
      const parts = (activeShift.start_time || '08:00:00').split(':');
      const shiftHour = parseInt(parts[0] || '8', 10);
      const shiftMinute = parseInt(parts[1] || '0', 10);
      const shiftStartTime = new Date();
      shiftStartTime.setHours(shiftHour, shiftMinute + (activeShift.grace_period_minutes || 15), 0, 0);

      if (now > shiftStartTime) {
        initialStatus = 'LATE';
      }
    }

    record = await repository.upsertAttendanceRecord({
      tenant_id: tenantId,
      hospital_id: hospitalId || 'default',
      userId,
      user_type: effectiveUserType,
      date: todayStr,
      shift_id: activeShift?.id || null,
      check_in_time: now.toISOString(),
      status: initialStatus,
      check_in_method: data.method || 'WEB_PORTAL',
      check_in_ip: ip ?? null,
      check_in_device: device ?? null,
      check_in_location: location ?? null,
    });

    const punchRecord = await repository.insertPunch(
      record.id,
      'IN',
      location ?? null,
      ip ?? null,
      device ?? null,
      'VERIFIED',
      tenantId
    );

    return {
      punch: punchRecord,
      record,
      message: initialStatus === 'LATE'
        ? 'Checked in successfully (marked late based on shift timing).'
        : 'Checked in on time successfully.',
    };
  }

  // For OUT, BREAK_START, BREAK_END: record must exist
  if (!record || !record.check_in_time) {
    throw new BadRequestError('Cannot punch out or take break without checking in first.');
  }

  if (punchType === 'OUT') {
    if (record.check_out_time) {
      throw new BadRequestError('You have already checked out for today.');
    }

    const checkInTime = new Date(record.check_in_time).getTime();
    const checkOutTime = now.getTime();
    const totalMinutes = Math.max(0, Math.floor((checkOutTime - checkInTime) / 60000));
    const workingMinutes = Math.max(0, totalMinutes - (record.total_break_minutes || 0));

    // When turning off attendance (punching out), status must remain PRESENT (or retain LATE if arrived late), never ABSENT.
    const finalStatus: AttendanceStatus =
      record.status === 'LATE' || record.status === 'ON_DUTY_ROUNDS'
        ? record.status
        : 'PRESENT';

    // Overtime calculation
    let overtimeMinutes = 0;
    if (activeShift) {
      const startParts = (activeShift.start_time || '08:00:00').split(':');
      const endParts = (activeShift.end_time || '16:00:00').split(':');
      const startH = parseInt(startParts[0] || '8', 10);
      const startM = parseInt(startParts[1] || '0', 10);
      const endH = parseInt(endParts[0] || '16', 10);
      const endM = parseInt(endParts[1] || '0', 10);

      const expectedMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (workingMinutes > expectedMinutes) {
        overtimeMinutes = workingMinutes - expectedMinutes;
      }
    }

    record = await repository.upsertAttendanceRecord({
      tenant_id: tenantId,
      hospital_id: hospitalId || 'default',
      userId,
      user_type: effectiveUserType,
      date: todayStr,
      check_out_time: now.toISOString(),
      total_working_minutes: workingMinutes,
      overtime_minutes: overtimeMinutes,
      status: finalStatus,
      check_out_location: location ?? null,
    });

    const punchRecord = await repository.insertPunch(
      record.id,
      'OUT',
      location ?? null,
      ip ?? null,
      device ?? null,
      'VERIFIED',
      tenantId
    );

    return {
      punch: punchRecord,
      record,
      message: `Checked out successfully. Total working time: ${Math.floor(workingMinutes / 60)}h ${workingMinutes % 60}m.`,
    };
  }

  // Handle BREAK_START & BREAK_END
  const punches = await repository.getPunchesForRecord(record.id);
  const lastPunch = punches[punches.length - 1];

  if (punchType === 'BREAK_START') {
    if (lastPunch && lastPunch.punch_type === 'BREAK_START') {
      throw new BadRequestError('You are already on a break.');
    }

    const punchRecord = await repository.insertPunch(
      record.id,
      'BREAK_START',
      location ?? null,
      ip ?? null,
      device ?? null,
      'VERIFIED',
      tenantId
    );

    return {
      punch: punchRecord,
      record,
      message: 'Break started. Working timer paused.',
    };
  }

  if (punchType === 'BREAK_END') {
    if (!lastPunch || lastPunch.punch_type !== 'BREAK_START') {
      throw new BadRequestError('Cannot end break without starting a break first.');
    }

    const breakStartMs = new Date(lastPunch.punched_at).getTime();
    const breakEndMs = now.getTime();
    const additionalBreakMinutes = Math.max(0, Math.floor((breakEndMs - breakStartMs) / 60000));
    const newTotalBreakMinutes = (record.total_break_minutes || 0) + additionalBreakMinutes;

    record = await repository.upsertAttendanceRecord({
      tenant_id: tenantId,
      userId,
      user_type: effectiveUserType,
      date: todayStr,
      total_break_minutes: newTotalBreakMinutes,
    });

    const punchRecord = await repository.insertPunch(
      record.id,
      'BREAK_END',
      location ?? null,
      ip ?? null,
      device ?? null,
      'VERIFIED',
      tenantId
    );

    return {
      punch: punchRecord,
      record,
      message: `Break ended (${additionalBreakMinutes} mins). Working timer resumed.`,
    };
  }

  throw new BadRequestError('Invalid punch action.');
}

export async function getMyHistory(
  userId: string,
  startDate?: string,
  endDate?: string,
  tenantId = 'default'
): Promise<{
  history: AttendanceRecord[];
  kpis: {
    totalDays: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    absentDays: number;
    totalHoursWorked: number;
    averageDailyHours: number;
  };
}> {
  const now = new Date();
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] || getTodayDateStr();
  const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0] || getTodayDateStr();

  const history = await repository.getUserAttendanceHistory(userId, start, end, tenantId);

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let totalWorkingMinutes = 0;

  for (const item of history) {
    if (item.status === 'PRESENT') presentDays++;
    else if (item.status === 'LATE') {
      lateDays++;
      presentDays++; // Late arrivals still count as present
    } else if (item.status === 'HALF_DAY') halfDays++;
    else if (item.status === 'ABSENT') absentDays++;

    totalWorkingMinutes += item.total_working_minutes || 0;
  }

  const totalDays = history.length;
  const totalHoursWorked = +(totalWorkingMinutes / 60).toFixed(1);
  const averageDailyHours = presentDays > 0 ? +(totalHoursWorked / presentDays).toFixed(1) : 0;

  return {
    history,
    kpis: {
      totalDays,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      totalHoursWorked,
      averageDailyHours,
    },
  };
}

export async function getAdminDashboardSummary(
  date?: string,
  tenantId = 'default'
): Promise<AttendanceDashboardSummary> {
  const targetDate = date || getTodayDateStr();
  return repository.getAdminDashboardStats(targetDate, tenantId);
}

export async function getAdminRecords(
  filters: AttendanceFilterParams,
  tenantId = 'default'
): Promise<{ records: AttendanceRecord[]; total: number }> {
  return repository.getAdminAttendanceRecords(filters, tenantId);
}

function normalizeToIsoWithTz(dateTimeStr?: string | null): string | null {
  if (!dateTimeStr) return null;
  const trimmed = dateTimeStr.trim();
  // If already has Z or timezone offset like +05:30 or -04:00
  if (trimmed.endsWith('Z') || /[+-]\d{2}(:?\d{2})?$/.test(trimmed)) {
    return trimmed;
  }
  // If naive string (e.g. "2026-11-17T09:00:00" or "2026-11-17 09:00:00"), default to Indian Standard Time (+05:30)
  return `${trimmed.replace(' ', 'T')}+05:30`;
}

export async function createManualEntry(
  adminUserId: string,
  data: {
    userId: string;
    userType: UserType;
    date: string;
    shiftId?: string | undefined;
    checkInTime?: string | undefined;
    checkOutTime?: string | undefined;
    status: AttendanceStatus;
    reason: string;
    remarks?: string | undefined;
    hospitalId?: string | undefined;
    tenantId?: string | undefined;
  }
): Promise<AttendanceRecord> {
  if (!data.reason || !data.reason.trim()) {
    throw new BadRequestError('A mandatory reason is required for manual attendance entries.');
  }

  const normalizedIn = normalizeToIsoWithTz(data.checkInTime);
  const normalizedOut = normalizeToIsoWithTz(data.checkOutTime);

  let workingMinutes = 0;
  if (normalizedIn && normalizedOut) {
    const inMs = new Date(normalizedIn).getTime();
    const outMs = new Date(normalizedOut).getTime();
    workingMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000));
  }

  const existing = await repository.findAttendanceRecord(data.userId, data.date, data.tenantId || 'default');
  let finalStatus = data.status;
  if (existing && existing.status === 'PRESENT') {
    finalStatus = 'PRESENT';
  }

  const userProfile = await repository.getUserProfile(data.userId);
  const effectiveUserType: UserType =
    (data.userType && data.userType !== 'STAFF')
      ? data.userType
      : (userProfile?.userType || data.userType || 'STAFF');

  const record = await repository.upsertAttendanceRecord({
    tenant_id: data.tenantId || 'default',
    hospital_id: data.hospitalId || 'default',
    userId: data.userId,
    user_type: effectiveUserType,
    date: data.date,
    shift_id: data.shiftId || null,
    check_in_time: normalizedIn ?? null,
    check_out_time: normalizedOut ?? null,
    total_working_minutes: workingMinutes,
    status: finalStatus,
    check_in_method: 'MANUAL_ADMIN',
    is_manual_entry: true,
    manual_reason: data.reason.trim(),
    approved_by: adminUserId,
    remarks: data.remarks ?? null,
  });

  if (normalizedIn) {
    try {
      await repository.clearPunchesForRecord(record.id);
      await repository.insertPunch(
        record.id,
        'IN',
        null,
        null,
        'Manual Admin Entry',
        'VERIFIED',
        record.tenant_id,
        record.check_in_time || normalizedIn
      );
      if (normalizedOut) {
        await repository.insertPunch(
          record.id,
          'OUT',
          null,
          null,
          'Manual Admin Entry',
          'VERIFIED',
          record.tenant_id,
          record.check_out_time || normalizedOut
        );
      }
    } catch (_e) {}
  }

  return record;
}

export async function deleteAttendanceRecord(recordId: string, tenantId = 'default'): Promise<boolean> {
  return repository.deleteAttendanceRecord(recordId, tenantId);
}

// Shifts
export async function getAllShifts(tenantId = 'default'): Promise<AttendanceShift[]> {
  return repository.getAllShifts(tenantId);
}

export async function createShift(data: Partial<AttendanceShift>): Promise<AttendanceShift> {
  if (!data.name || !data.code || !data.start_time || !data.end_time) {
    throw new BadRequestError('Shift name, code, start time, and end time are required.');
  }
  return repository.createShift(data);
}

export async function updateShift(shiftId: string, data: Partial<AttendanceShift>): Promise<AttendanceShift> {
  const updated = await repository.updateShift(shiftId, data);
  if (!updated) throw new NotFoundError('Shift not found.');
  return updated;
}

export async function assignUserShift(data: {
  userId: string;
  shiftId: string;
  userType: UserType;
  dayOfWeek?: number | null | undefined;
  specificDate?: string | null | undefined;
  effectiveFrom: string;
  effectiveTo?: string | null | undefined;
  assignedBy?: string | null | undefined;
  tenantId?: string | undefined;
}) {
  return repository.assignUserShift(data);
}

// Regularization
export async function submitRegularization(data: {
  userId: string;
  recordId?: string | null | undefined;
  date: string;
  requestType: RegularizationType;
  requestedCheckIn?: string | null | undefined;
  requestedCheckOut?: string | null | undefined;
  reason: string;
  tenantId?: string | undefined;
}): Promise<AttendanceRegularization> {
  if (!data.reason || !data.reason.trim()) {
    throw new BadRequestError('Reason is required for attendance regularization.');
  }
  return repository.createRegularizationRequest(data);
}

export async function getMyRegularizations(
  userId: string,
  tenantId = 'default'
): Promise<AttendanceRegularization[]> {
  return repository.getUserRegularizations(userId, tenantId);
}

export async function getAllRegularizations(
  status?: RegularizationStatus | 'ALL' | undefined,
  tenantId = 'default'
): Promise<AttendanceRegularization[]> {
  return repository.getAllRegularizations(status, tenantId);
}

export async function reviewRegularization(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewerId: string,
  rejectionReason?: string | undefined
): Promise<AttendanceRegularization> {
  const updated = await repository.updateRegularizationStatus(id, status, reviewerId, rejectionReason);
  if (!updated) throw new NotFoundError('Regularization request not found.');

  // If approved, update or create the attendance record
  if (status === 'APPROVED' && updated.date) {
    let workingMinutes = 0;
    if (updated.requested_check_in && updated.requested_check_out) {
      const inMs = new Date(updated.requested_check_in).getTime();
      const outMs = new Date(updated.requested_check_out).getTime();
      workingMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000));
    }

    await repository.upsertAttendanceRecord({
      tenant_id: updated.tenant_id,
      userId: updated.user_id,
      date: updated.date,
      check_in_time: updated.requested_check_in ?? null,
      check_out_time: updated.requested_check_out ?? null,
      total_working_minutes: workingMinutes,
      status: 'PRESENT',
      is_manual_entry: true,
      manual_reason: `Regularization approved: ${updated.reason}`,
      approved_by: reviewerId,
    });
  }

  return updated;
}
