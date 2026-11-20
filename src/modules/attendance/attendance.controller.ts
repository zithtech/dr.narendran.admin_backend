import type { Request, Response } from 'express';

import { UnauthorizedError, ValidationError } from '@/http/errors.js';
import * as service from './attendance.service.js';
import type {
  AttendanceFilterParams,
  AttendanceStatus,
  PunchType,
  RegularizationStatus,
  RegularizationType,
  UserType,
} from './attendance.types.js';

export function getUserTypeFromRole(role?: string): UserType {
  if (!role) return 'STAFF';
  const r = role.trim().toUpperCase();
  if (r.includes('ADMIN')) return 'ADMIN';
  if (r.includes('DOCTOR') || r.includes('PHYSICIAN') || r.includes('SURGEON')) return 'DOCTOR';
  return 'STAFF';
}

// ----------------------------------------------------
// Self-Service Controllers (Doctor, Staff & Admin)
// ----------------------------------------------------

export async function getTodayStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const role = (req.user as any).rbacRole || req.user.role;
  const userType = getUserTypeFromRole(role);
  const result = await service.getTodayStatus(req.user.id, userType);
  res.status(200).json({ status: 'success', data: result });
}

export async function punch(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { punchType, location, device } = req.body as {
    punchType: PunchType;
    location?: any;
    device?: string;
  };

  if (!punchType || !['IN', 'OUT', 'BREAK_START', 'BREAK_END'].includes(punchType)) {
    throw new ValidationError('Valid punchType (IN, OUT, BREAK_START, BREAK_END) is required.');
  }

  const role = (req.user as any).rbacRole || req.user.role;
  const userType = getUserTypeFromRole(role);
  const ip = req.ip || (req.headers['x-forwarded-for'] as string) || null;

  const result = await service.punch({
    userId: req.user.id,
    userType,
    punchType,
    location: location ?? null,
    ip: ip ?? null,
    device: device ?? null,
  });

  res.status(200).json({ status: 'success', data: result });
}

export async function getMyHistory(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const result = await service.getMyHistory(req.user.id, startDate, endDate);
  res.status(200).json({ status: 'success', data: result });
}

export async function submitRegularization(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { recordId, date, requestType, requestedCheckIn, requestedCheckOut, reason } = req.body as {
    recordId?: string;
    date: string;
    requestType: RegularizationType;
    requestedCheckIn?: string;
    requestedCheckOut?: string;
    reason: string;
  };

  if (!date || !reason) {
    throw new ValidationError('Date and reason are required for regularization.');
  }

  const result = await service.submitRegularization({
    userId: req.user.id,
    recordId: recordId ?? null,
    date,
    requestType: requestType || 'MISSED_PUNCH_IN',
    requestedCheckIn: requestedCheckIn ?? null,
    requestedCheckOut: requestedCheckOut ?? null,
    reason,
  });

  res.status(201).json({ status: 'success', data: result });
}

export async function getMyRegularizations(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const result = await service.getMyRegularizations(req.user.id);
  res.status(200).json({ status: 'success', data: result });
}

// ----------------------------------------------------
// Admin Operations Controllers
// ----------------------------------------------------

export async function getAdminDashboardSummary(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { date } = req.query as { date?: string };
  const summary = await service.getAdminDashboardSummary(date);
  res.status(200).json({ status: 'success', data: summary });
}

export async function getAdminRecords(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const {
    date,
    startDate,
    endDate,
    userType,
    role,
    department,
    shiftId,
    status,
    search,
    page,
    limit,
  } = req.query as Record<string, string>;

  const filters: AttendanceFilterParams = {};
  if (date) filters.date = date;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (userType) filters.userType = userType as any;
  if (role) filters.role = role;
  if (department) filters.department = department;
  if (shiftId) filters.shiftId = shiftId;
  if (status) filters.status = status as AttendanceStatus | 'ALL';
  if (search) filters.search = search;
  if (page) filters.page = parseInt(page, 10);
  if (limit) filters.limit = parseInt(limit, 10);

  const result = await service.getAdminRecords(filters);
  res.status(200).json({ status: 'success', data: result });
}

export async function createManualEntry(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const {
    userId,
    userType,
    date,
    shiftId,
    checkInTime,
    checkOutTime,
    status,
    reason,
    remarks,
  } = req.body;

  if (!userId || !date || !status || !reason) {
    throw new ValidationError('userId, date, status, and a mandatory reason are required.');
  }

  const result = await service.createManualEntry(req.user.id, {
    userId,
    userType: userType || 'STAFF',
    date,
    shiftId: shiftId || undefined,
    checkInTime: checkInTime || undefined,
    checkOutTime: checkOutTime || undefined,
    status,
    reason,
    remarks: remarks || undefined,
  });

  res.status(201).json({ status: 'success', data: result });
}

export async function getAllShifts(_req: Request, res: Response): Promise<void> {
  const shifts = await service.getAllShifts();
  res.status(200).json({ status: 'success', data: shifts });
}

export async function createShift(req: Request, res: Response): Promise<void> {
  const shift = await service.createShift(req.body);
  res.status(201).json({ status: 'success', data: shift });
}

export async function updateShift(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const shift = await service.updateShift(id, req.body);
  res.status(200).json({ status: 'success', data: shift });
}

export async function assignUserShift(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const assignment = await service.assignUserShift({
    ...req.body,
    assignedBy: req.user.id,
  });

  res.status(201).json({ status: 'success', data: assignment });
}

export async function getAllRegularizations(req: Request, res: Response): Promise<void> {
  const { status } = req.query as { status?: RegularizationStatus | 'ALL' };
  const list = await service.getAllRegularizations(status);
  res.status(200).json({ status: 'success', data: list });
}

export async function reviewRegularization(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  const { status, rejectionReason } = req.body as {
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  };

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    throw new ValidationError('Status must be APPROVED or REJECTED.');
  }

  const result = await service.reviewRegularization(id, status, req.user.id, rejectionReason);
  res.status(200).json({ status: 'success', data: result });
}

export async function exportAttendanceReport(req: Request, res: Response): Promise<void> {
  const { startDate, endDate, userType } = req.query as Record<string, string>;
  const filters: AttendanceFilterParams = {
    limit: 1000,
  };
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (userType) filters.userType = userType as any;

  const result = await service.getAdminRecords(filters);

  // Construct CSV stream
  const header = ['Date', 'User Name', 'Role', 'Department', 'Shift', 'Check In', 'Check Out', 'Working Hours', 'Status', 'Method'];
  const rows = result.records.map((r) => [
    r.date,
    `"${r.user_name || ''}"`,
    `"${r.user_role || ''}"`,
    `"${r.department || ''}"`,
    `"${r.shift?.name || 'General'}"`,
    r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '-',
    r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : '-',
    `${Math.floor(r.total_working_minutes / 60)}h ${r.total_working_minutes % 60}m`,
    r.status,
    r.check_in_method,
  ]);

  const csvContent = [header.join(','), ...rows.map((e) => e.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${Date.now()}.csv`);
  res.status(200).send(csvContent);
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  const rawId = req.params['id'];
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    throw new ValidationError('Record ID is required.');
  }
  const deleted = await service.deleteAttendanceRecord(id);
  res.status(200).json({ status: 'success', data: { deleted } });
}
