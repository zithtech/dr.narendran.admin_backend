import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/appointments/appointments.repository.js');
vi.mock('@/modules/notifications/notification.service.js');

import * as repo from '@/modules/appointments/appointments.repository.js';
import * as service from '@/modules/appointments/appointments.service.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

const DOCTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_USER_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const APPT_ID = '55555555-5555-4555-8555-555555555555';

describe('Reschedule Reminder and Filtering Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repo.getDoctorIdByUserId).mockResolvedValue(DOCTOR_PROFILE_ID);
  });

  describe('getDoctorRescheduleRequests', () => {
    it('calls repository with resolved doctorId and filter status', async () => {
      const mockRequests = [
        {
          id: REQUEST_ID,
          appointmentId: APPT_ID,
          doctorId: DOCTOR_PROFILE_ID,
          patientId: PATIENT_USER_ID,
          patientName: 'Priya Sharma',
          patientPhone: '+919876543210',
          proposedSlotId: 'slot-1',
          proposedStart: '2026-10-30T10:00:00.000Z',
          proposedEnd: '2026-10-30T10:25:00.000Z',
          origScheduledStart: '2026-10-25T10:00:00.000Z',
          origScheduledEnd: '2026-10-25T10:25:00.000Z',
          tokenNumber: 5,
          appointmentPurpose: 'Consultation',
          reason: 'Doctor surgery schedule change',
          status: 'pending' as const,
          createdAt: '2026-10-20T10:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
          expiresAt: '2026-10-22T10:00:00.000Z',
          reminderCount: 0,
        },
      ];

      vi.mocked(repo.getDoctorRescheduleRequests).mockResolvedValue(mockRequests);

      const result = await service.getDoctorRescheduleRequests(DOCTOR_USER_ID, 'pending');

      expect(repo.getDoctorIdByUserId).toHaveBeenCalledWith(DOCTOR_USER_ID);
      expect(repo.getDoctorRescheduleRequests).toHaveBeenCalledWith(DOCTOR_PROFILE_ID, 'pending');
      expect(result).toEqual(mockRequests);
      expect(result[0]?.status).toBe('pending');
    });
  });

  describe('sendRescheduleReminder', () => {
    it('dispatches reminder notification to patient and updates request', async () => {
      const mockRequest = {
        id: REQUEST_ID,
        appointmentId: APPT_ID,
        doctorId: DOCTOR_PROFILE_ID,
        patientId: PATIENT_USER_ID,
        patientName: 'Priya Sharma',
        patientPhone: '+919876543210',
        proposedSlotId: 'slot-1',
        proposedStart: '2026-10-30T10:00:00.000Z',
        proposedEnd: '2026-10-30T10:25:00.000Z',
        origScheduledStart: '2026-10-25T10:00:00.000Z',
        origScheduledEnd: '2026-10-25T10:25:00.000Z',
        tokenNumber: 5,
        appointmentPurpose: 'Consultation',
        reason: 'Doctor schedule change',
        status: 'pending' as const,
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T11:00:00.000Z',
        expiresAt: '2026-10-22T10:00:00.000Z',
        lastReminderSentAt: '2026-10-20T11:00:00.000Z',
        reminderCount: 1,
      };

      vi.mocked(repo.sendRescheduleReminderTx).mockResolvedValue({
        request: mockRequest,
        patientUserId: PATIENT_USER_ID,
      });

      vi.mocked(notificationService.sendToPatient).mockResolvedValue(undefined as any);

      const result = await service.sendRescheduleReminder(REQUEST_ID, DOCTOR_USER_ID);

      expect(repo.sendRescheduleReminderTx).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        doctorId: DOCTOR_PROFILE_ID,
      });

      expect(notificationService.sendToPatient).toHaveBeenCalledWith(
        PATIENT_USER_ID,
        expect.objectContaining({
          type: NotificationType.DOCTOR_RESCHEDULE_PROPOSED,
          title: expect.stringContaining('Reschedule Request Pending'),
          entityType: 'APPOINTMENT',
          entityId: APPT_ID,
          route: 'AppointmentDetails',
          data: expect.objectContaining({
            appointmentId: APPT_ID,
            requestId: REQUEST_ID,
            isReminder: 'true',
          }),
        }),
      );

      expect(result.reminderCount).toBe(1);
      expect(result.lastReminderSentAt).toBe('2026-10-20T11:00:00.000Z');
    });

    it('throws ConflictError if request is not pending, expired, or not found', async () => {
      vi.mocked(repo.sendRescheduleReminderTx).mockResolvedValue(null);

      await expect(
        service.sendRescheduleReminder(REQUEST_ID, DOCTOR_USER_ID),
      ).rejects.toThrowError(/Reschedule request not found, is no longer pending, or has expired/);

      expect(notificationService.sendToPatient).not.toHaveBeenCalled();
    });
  });
});
