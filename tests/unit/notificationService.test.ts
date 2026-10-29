import { beforeEach,describe, expect, it, vi } from 'vitest';

import { firebaseNotificationService } from '@/modules/notifications/firebaseNotification.service.js';
import { notificationRepository } from '@/modules/notifications/notification.repository.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { AppType,NotificationType, PlatformType } from '@/modules/notifications/notification.types.js';

describe('NotificationService Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Device Registration & Unregistration', () => {
    it('registers a device token correctly for a user', async () => {
      const mockDevice = {
        id: 'dev-123',
        userId: 'user-abc',
        token: 'fcm-token-123',
        platform: PlatformType.ANDROID,
        deviceId: 'device-xyz',
        appType: AppType.PATIENT,
        isActive: true,
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(notificationRepository, 'upsertDeviceToken').mockResolvedValue(mockDevice);

      const result = await notificationService.registerDevice('user-abc', {
        token: 'fcm-token-123',
        platform: PlatformType.ANDROID,
        appType: AppType.PATIENT,
        deviceId: 'device-xyz',
      });

      expect(notificationRepository.upsertDeviceToken).toHaveBeenCalledWith(
        'user-abc',
        'fcm-token-123',
        PlatformType.ANDROID,
        AppType.PATIENT,
        'device-xyz',
      );
      expect(result).toEqual(mockDevice);
    });

    it('unregisters / deactivates a device token', async () => {
      vi.spyOn(notificationRepository, 'deactivateDeviceToken').mockResolvedValue(true);

      const result = await notificationService.unregisterDevice('user-abc', 'fcm-token-123');

      expect(notificationRepository.deactivateDeviceToken).toHaveBeenCalledWith('user-abc', 'fcm-token-123');
      expect(result).toBe(true);
    });
  });

  describe('sendToUser', () => {
    it('sends FCM push to all user active devices and saves in-app history', async () => {
      vi.spyOn(notificationRepository, 'getActiveTokensForUser').mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-abc',
          token: 'token-1',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.spyOn(firebaseNotificationService, 'sendMulticast').mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        invalidTokens: [],
        errors: [],
      });

      vi.spyOn(notificationRepository, 'createNotification').mockResolvedValue({
        id: 'notif-1',
        userId: 'user-abc',
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Your appointment is confirmed for tomorrow',
        entityType: 'APPOINTMENT',
        entityId: 'apt-123',
        route: 'AppointmentDetails',
        data: { id: 'apt-123' },
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        isDuplicate: false,
      });

      vi.spyOn(notificationRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const res = await notificationService.sendToUser('user-abc', {
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Your appointment is confirmed for tomorrow',
        entityType: 'APPOINTMENT',
        entityId: 'apt-123',
        route: 'AppointmentDetails',
        data: { id: 'apt-123' },
      });

      expect(res.sentCount).toBe(1);
      expect(res.failureCount).toBe(0);
      expect(firebaseNotificationService.sendMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-1'],
          title: 'Appointment Confirmed',
          body: 'Your appointment is confirmed for tomorrow',
        }),
      );
      expect(notificationRepository.createNotification).toHaveBeenCalled();
      expect(notificationRepository.updateDeliveryStatus).toHaveBeenCalledWith(
        'notif-1',
        'SENT',
        expect.objectContaining({ failureReason: null }),
      );
    });

    it('suppresses duplicate notifications when idempotency key already exists', async () => {
      vi.spyOn(notificationRepository, 'getActiveTokensForUser').mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-abc',
          token: 'token-1',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const multicastSpy = vi.spyOn(firebaseNotificationService, 'sendMulticast');

      vi.spyOn(notificationRepository, 'createNotification').mockResolvedValue({
        id: 'existing-notif',
        userId: 'user-abc',
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Already saved',
        entityType: 'APPOINTMENT',
        entityId: 'apt-123',
        route: 'AppointmentDetails',
        data: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        isDuplicate: true,
      });

      const res = await notificationService.sendToUser('user-abc', {
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Already saved',
        idempotencyKey: 'apt-confirm-123',
      });

      expect(res.sentCount).toBe(0);
      expect(multicastSpy).not.toHaveBeenCalled();
    });

    it('preserves in-app notification when FCM push delivery throws an error', async () => {
      vi.spyOn(notificationRepository, 'getActiveTokensForUser').mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-abc',
          token: 'token-1',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.spyOn(firebaseNotificationService, 'sendMulticast').mockRejectedValue(
        new Error('Network timeout reaching Google FCM servers'),
      );

      vi.spyOn(notificationRepository, 'createNotification').mockResolvedValue({
        id: 'notif-saved',
        userId: 'user-abc',
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Your appointment is confirmed',
        entityType: 'APPOINTMENT',
        entityId: 'apt-123',
        route: 'AppointmentDetails',
        data: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
        isDuplicate: false,
      });

      const updateStatusSpy = vi.spyOn(notificationRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const res = await notificationService.sendToUser('user-abc', {
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Appointment Confirmed',
        body: 'Your appointment is confirmed',
      });

      expect(res.sentCount).toBe(0);
      expect(res.failureCount).toBe(1);
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'notif-saved',
        'FAILED',
        expect.objectContaining({
          failureReason: 'Network timeout reaching Google FCM servers',
        }),
      );
    });

    it('deactivates invalid tokens when FCM returns them', async () => {
      vi.spyOn(notificationRepository, 'getActiveTokensForUser').mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-abc',
          token: 'stale-token',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.spyOn(firebaseNotificationService, 'sendMulticast').mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        invalidTokens: ['stale-token'],
        errors: [],
      });

      const deactivateSpy = vi.spyOn(notificationRepository, 'deactivateTokens').mockResolvedValue(1);
      vi.spyOn(notificationRepository, 'createNotification').mockResolvedValue({} as any);

      const res = await notificationService.sendToUser('user-abc', {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'Reminder',
        body: 'Reminder text',
      });

      expect(res.deactivatedTokens).toContain('stale-token');
      expect(deactivateSpy).toHaveBeenCalledWith(['stale-token']);
    });
  });

  describe('sendToUsers', () => {
    it('handles multiple user targeting with batch token fetching', async () => {
      vi.spyOn(notificationRepository, 'getActiveTokensForUsers').mockResolvedValue([
        {
          id: 'dev-1',
          userId: 'user-1',
          token: 'token-u1',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'dev-2',
          userId: 'user-2',
          token: 'token-u2',
          platform: 'ANDROID',
          deviceId: null,
          appType: 'PATIENT',
          isActive: true,
          lastSeenAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.spyOn(firebaseNotificationService, 'sendMulticast').mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        invalidTokens: [],
        errors: [],
      });

      vi.spyOn(notificationRepository, 'createNotificationsBatch').mockResolvedValue([]);

      const res = await notificationService.sendToUsers(['user-1', 'user-2'], {
        type: NotificationType.DOCTOR_MESSAGE,
        title: 'Message',
        body: 'Broadcast update',
      });

      expect(res.sentCount).toBe(2);
      expect(notificationRepository.getActiveTokensForUsers).toHaveBeenCalledWith(['user-1', 'user-2'], undefined);
      expect(notificationRepository.createNotificationsBatch).toHaveBeenCalled();
    });
  });
});
