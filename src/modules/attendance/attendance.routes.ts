import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermission } from '@/http/middleware/rbac.middleware.js';
import * as controller from './attendance.controller.js';

export const attendanceRouter: Router = Router();

// All attendance endpoints require authentication
attendanceRouter.use(requireAuth);

// ----------------------------------------------------
// 1. Self-Service Routes (Doctor & Staff Personal App)
// ----------------------------------------------------
attendanceRouter.get('/today-status', controller.getTodayStatus);
attendanceRouter.post('/punch', controller.punch);
attendanceRouter.get('/my-history', controller.getMyHistory);
attendanceRouter.post('/regularize', controller.submitRegularization);
attendanceRouter.get('/my-requests', controller.getMyRegularizations);

// ----------------------------------------------------
// 2. Admin Operations Routes
// ----------------------------------------------------
attendanceRouter.get(
  '/admin/dashboard',
  requirePermission('ATTENDANCE', 'read'),
  controller.getAdminDashboardSummary
);

attendanceRouter.get(
  '/admin/records',
  requirePermission('ATTENDANCE', 'read'),
  controller.getAdminRecords
);

attendanceRouter.delete(
  '/admin/records/:id',
  requirePermission('ATTENDANCE', 'delete'),
  controller.deleteRecord
);

attendanceRouter.post(
  '/admin/manual-entry',
  requirePermission('ATTENDANCE', 'create'),
  controller.createManualEntry
);

attendanceRouter.get(
  '/admin/shifts',
  requirePermission('ATTENDANCE', 'read'),
  controller.getAllShifts
);

attendanceRouter.post(
  '/admin/shifts',
  requirePermission('ATTENDANCE', 'create'),
  controller.createShift
);

attendanceRouter.put(
  '/admin/shifts/:id',
  requirePermission('ATTENDANCE', 'update'),
  controller.updateShift
);

attendanceRouter.post(
  '/admin/roster-assign',
  requirePermission('ATTENDANCE', 'update'),
  controller.assignUserShift
);

attendanceRouter.get(
  '/admin/regularizations',
  requirePermission('ATTENDANCE', 'read'),
  controller.getAllRegularizations
);

attendanceRouter.patch(
  '/admin/regularizations/:id',
  requirePermission('ATTENDANCE', 'update'),
  controller.reviewRegularization
);

attendanceRouter.get(
  '/admin/export',
  requirePermission('ATTENDANCE', 'read'),
  controller.exportAttendanceReport
);

