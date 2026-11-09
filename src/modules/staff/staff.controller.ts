import type { Request, Response } from 'express';

import { NotFoundError, UnauthorizedError, ValidationError } from '@/http/errors.js';

import * as service from './staff.service.js';
import type { StaffFilterParams, StaffStatus } from './staff.types.js';

export async function getAllStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { search, role, hospitalId, branchId, shiftTiming, status } = req.query as Record<string, string>;
  const filters: StaffFilterParams = {};

  if (search) filters.search = search;
  if (role) filters.role = role;
  if (hospitalId) filters.hospitalId = hospitalId;
  if (branchId) filters.branchId = branchId;
  if (shiftTiming) filters.shiftTiming = shiftTiming;
  if (status) filters.status = status as StaffStatus | 'ALL';

  const staff = await service.getAllStaff(filters);
  res.status(200).json({ status: 'success', data: staff });
}

export async function getStaffById(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  const staff = await service.getStaffById(id);
  res.status(200).json({ status: 'success', data: staff });
}

export async function createStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const {
    name,
    phone,
    email,
    address,
    role,
    hospitalId,
    hospital_id,
    branchId,
    branch_id,
    shiftTiming,
    shift_timing,
    customShiftDetails,
    custom_shift_details,
    workDays,
    work_days,
    joiningDate,
    joining_date,
    status,
    notes,
  } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Staff name is required.');
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('Staff name must be at least 2 characters.');
  }
  if (trimmedName.length > 100) {
    throw new ValidationError('Staff name cannot exceed 100 characters.');
  }
  if (!/^[a-zA-Z\s.'-]+$/.test(trimmedName)) {
    throw new ValidationError('Staff name can only contain alphabetic letters and spaces (no numbers or special characters).');
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    throw new ValidationError('Phone number is required.');
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError('Phone number must contain between 10 and 15 digits.');
  }

  if (email && typeof email === 'string' && email.trim()) {
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(trimmedEmail)) {
      throw new ValidationError('Please enter a valid email address.');
    }
  }

  if (!role || typeof role !== 'string' || !role.trim()) {
    throw new ValidationError('Staff role is required.');
  }

  const effectiveShift = shiftTiming ?? shift_timing ?? 'Morning';
  const effectiveCustomShift = customShiftDetails ?? custom_shift_details;
  if (effectiveShift === 'Custom Shift' && (!effectiveCustomShift || !effectiveCustomShift.trim())) {
    throw new ValidationError('Custom shift working hours are required when Custom Shift is selected.');
  }

  const staff = await service.createStaff({
    name,
    phone,
    email,
    address,
    role,
    hospitalId: hospitalId ?? hospital_id,
    branchId: branchId ?? branch_id,
    shiftTiming: shiftTiming ?? shift_timing ?? 'Morning',
    customShiftDetails: customShiftDetails ?? custom_shift_details,
    workDays: workDays ?? work_days,
    joiningDate: joiningDate ?? joining_date,
    status,
    notes,
  });

  res.status(201).json({ status: 'success', data: staff });
}

export async function updateStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  const { name, phone, email, role, shiftTiming, shift_timing, customShiftDetails, custom_shift_details } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Staff name cannot be empty.');
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      throw new ValidationError('Staff name must be at least 2 characters.');
    }
    if (!/^[a-zA-Z\s.'-]+$/.test(trimmedName)) {
      throw new ValidationError('Staff name can only contain alphabetic letters and spaces (no numbers or special characters).');
    }
  }

  if (phone !== undefined) {
    if (typeof phone !== 'string' || !phone.trim()) {
      throw new ValidationError('Phone number cannot be empty.');
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      throw new ValidationError('Phone number must contain between 10 and 15 digits.');
    }
  }

  if (email !== undefined && email !== null && typeof email === 'string' && email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
      throw new ValidationError('Please enter a valid email address.');
    }
  }

  if (role !== undefined && (typeof role !== 'string' || !role.trim())) {
    throw new ValidationError('Staff role cannot be empty.');
  }

  const effectiveShift = shiftTiming ?? shift_timing;
  if (effectiveShift === 'Custom Shift') {
    const shiftDetails = customShiftDetails ?? custom_shift_details;
    if (!shiftDetails || typeof shiftDetails !== 'string' || !shiftDetails.trim()) {
      throw new ValidationError('Custom shift working hours are required when Custom Shift is selected.');
    }
  }

  const staff = await service.updateStaff(id, req.body);
  res.status(200).json({ status: 'success', data: staff });
}

export async function updateStaffStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  const { status } = req.body as { status: StaffStatus };

  if (!status || (status !== 'ACTIVE' && status !== 'INACTIVE')) {
    throw new ValidationError('Status must be either ACTIVE or INACTIVE.');
  }

  const staff = await service.updateStaffStatus(id, status);
  res.status(200).json({ status: 'success', data: staff });
}

export async function deleteStaff(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  await service.deleteStaff(id);
  res.status(200).json({ status: 'success', message: 'Staff member deleted successfully.' });
}

export async function uploadStaffDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id } = req.params as { id: string };
  const file = req.file;

  if (!file) {
    throw new ValidationError('No file uploaded.');
  }

  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'];
  if (!ALLOWED_EXTS.includes(ext)) {
    throw new ValidationError(`Unsupported document format (.${ext}). Allowed formats: PDF, PNG, JPG, DOC, DOCX.`);
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new ValidationError('File size exceeds the 20MB limit.');
  }

  const rawName = (req.body?.name as string) || file.originalname || 'Document';
  const trimmedName = rawName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw new ValidationError('Document title must be between 2 and 100 characters.');
  }
  if (/[^a-zA-Z0-9\s._()&/ -]/i.test(trimmedName)) {
    throw new ValidationError('Document title can only contain letters, numbers, spaces, and standard punctuation (._-()&).');
  }
  if (!/[a-zA-Z]/.test(trimmedName)) {
    throw new ValidationError('Document title must contain at least one letter.');
  }

  const documentType = (req.body?.documentType as string) || 'OTHER';

  const result = await service.uploadStaffDocument({
    staffId: id,
    name: trimmedName,
    documentType,
    file,
  });

  res.status(201).json({ status: 'success', data: result });
}

export async function deleteStaffDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id, docId } = req.params as { id: string; docId: string };
  const updatedStaff = await service.deleteStaffDocument(id, docId);
  res.status(200).json({ status: 'success', data: updatedStaff });
}

export async function viewStaffDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id, docId } = req.params as { id: string; docId: string };
  const docData = await service.getStaffDocumentStream(id, docId);

  res.setHeader('Content-Type', docData.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(docData.fileName)}"`
  );
  res.setHeader('Cache-Control', 'private, max-age=3600');

  if (docData.stream) {
    docData.stream.pipe(res);
  } else if (docData.redirectUrl) {
    res.redirect(docData.redirectUrl);
  } else {
    throw new NotFoundError('Document content is currently unavailable.');
  }
}

export async function downloadStaffDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }

  const { id, docId } = req.params as { id: string; docId: string };
  const docData = await service.getStaffDocumentStream(id, docId);

  res.setHeader('Content-Type', docData.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(docData.fileName)}"`
  );

  if (docData.stream) {
    docData.stream.pipe(res);
  } else if (docData.redirectUrl) {
    res.redirect(docData.redirectUrl);
  } else {
    throw new NotFoundError('Document content is currently unavailable.');
  }
}
