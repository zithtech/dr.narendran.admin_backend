import { queryOne } from '@/db/query.js';
import { logger } from '@/lib/logger.js';

import { firebaseNotificationService } from './firebaseNotification.service.js';
import { notificationRepository } from './notification.repository.js';
import {
  type DeliveryStatus,
  type NotificationPayload,
  type RegisterDeviceTokenInput,
  type SendNotificationResult,
} from './notification.types.js';

export class NotificationService {
  /**
   * Register or reactivate a device token for an authenticated user.
   */
  async registerDevice(userId: string, input: RegisterDeviceTokenInput) {
    logger.info(
      { userId, platform: input.platform, appType: input.appType },
      '[FCM] Registering device token',
    );
    const record = await notificationRepository.upsertDeviceToken(
      userId,
      input.token,
      input.platform,
      input.appType,
      input.deviceId ?? null,
    );
    logger.info(
      { userId, tokenId: record.id },
      '[FCM] Device token registered successfully',
    );
    return record;
  }

  /**
   * Unregister / deactivate a device token for an authenticated user.
   */
  async unregisterDevice(userId: string, token: string) {
    logger.info({ userId }, 'Unregistering device token');
    return notificationRepository.deactivateDeviceToken(userId, token);
  }

  /**
   * Send notification to a single user account across their registered active devices (optionally filtered by appType).
   * Persists to notifications table first before triggering FCM, ensuring delivery failure isolation.
   */
  async sendToUser(
    userId: string,
    payload: NotificationPayload,
    options: {
      saveInApp?: boolean;
      appType?: string;
    } = { saveInApp: true },
  ): Promise<SendNotificationResult> {
    let targetUserAccountId = userId;
    let devices = await notificationRepository.getActiveTokensForUser(
      targetUserAccountId,
      options.appType,
    );
    if (devices.length === 0) {
      const resolved =
        (await this.resolveUserAccountForPatient(userId)) ||
        (await this.resolveUserAccountForDoctor(userId));
      if (resolved && resolved !== targetUserAccountId) {
        targetUserAccountId = resolved;
        devices = await notificationRepository.getActiveTokensForUser(
          targetUserAccountId,
          options.appType,
        );
      }
    }
    const tokens = devices.map((d) => d.token);

    let sentCount = 0;
    let failureCount = 0;
    let deactivatedTokens: string[] = [];
    let inAppRecordId: string | null = null;

    logger.debug(
      {
        recipientUserId: targetUserAccountId,
        recipientAppType: options.appType ?? 'ALL',
        activeTokensCount: tokens.length,
        notificationType: payload.type,
      },
      '[FCM] Active device tokens found',
    );

    // 1. Persistence-First: Save to DB before triggering push
    if (options.saveInApp !== false) {
      const defaultEntityType =
        payload.type === 'CHAT_MESSAGE' ? 'CONVERSATION' : 'APPOINTMENT';
      const defaultRoute =
        payload.type === 'CHAT_MESSAGE' ? 'Chat' : 'AppointmentDetails';

      const created = await notificationRepository.createNotification({
        userId: targetUserAccountId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        entityType: payload.entityType ?? defaultEntityType,
        entityId: payload.entityId,
        route: payload.route ?? defaultRoute,
        data: payload.data,
        idempotencyKey: payload.idempotencyKey ?? null,
        deliveryStatus: 'PENDING',
      });

      inAppRecordId = created.id;

      if (created.isDuplicate) {
        logger.info(
          { userId: targetUserAccountId, idempotencyKey: payload.idempotencyKey },
          '[Notification] Duplicate notification suppressed via idempotency key',
        );
        return {
          sentCount: 0,
          failureCount: 0,
          deactivatedTokens: [],
        };
      }
    }

    // 2. Push Delivery
    if (tokens.length === 0) {
      logger.info(
        {
          recipientUserId: targetUserAccountId,
          recipientAppType: options.appType ?? 'ALL',
        },
        '[FCM] No active device tokens found; skipping push delivery',
      );
      if (inAppRecordId) {
        await notificationRepository.updateDeliveryStatus(inAppRecordId, 'SKIPPED', {
          failureReason: 'No active device tokens found',
        });
      }
    } else {
      logger.info(
        {
          recipientUserId: targetUserAccountId,
          recipientAppType: options.appType ?? 'ALL',
          tokenCount: tokens.length,
          type: payload.type,
          title: payload.title,
        },
        '[FCM] Sending notification',
      );

      const defaultEntityType =
        payload.type === 'CHAT_MESSAGE' ? 'CONVERSATION' : 'APPOINTMENT';
      const defaultRoute =
        payload.type === 'CHAT_MESSAGE' ? 'Chat' : 'AppointmentDetails';

      try {
        const sendResult = await firebaseNotificationService.sendMulticast({
          tokens,
          title: payload.title,
          body: payload.body,
          priority: 'high',
          data: {
            type: payload.type,
            entityType: payload.entityType ?? defaultEntityType,
            entityId: payload.entityId ?? '',
            route: payload.route ?? defaultRoute,
            screen: payload.route ?? defaultRoute,
            ...(payload.data ?? {}),
          },
        });

        sentCount = sendResult.successCount;
        failureCount = sendResult.failureCount;
        deactivatedTokens = sendResult.invalidTokens;

        if (sentCount > 0) {
          logger.info(
            {
              recipientUserId: targetUserAccountId,
              sentCount,
              failureCount,
              type: payload.type,
            },
            '[FCM] Notification sent successfully',
          );
        }

        if (failureCount > 0) {
          logger.warn(
            {
              recipientUserId: targetUserAccountId,
              failureCount,
              invalidCount: deactivatedTokens.length,
            },
            '[FCM] Firebase send failed for some devices',
          );
        }

        // Update in-app delivery status based on FCM result
        if (inAppRecordId) {
          let deliveryStatus: DeliveryStatus = 'SENT';
          let failureReason: string | null = null;

          if (sentCount === 0 && failureCount > 0) {
            deliveryStatus = 'FAILED';
            failureReason = sendResult.errors[0]?.error ?? 'Push delivery failed';
          } else if (sentCount > 0 && failureCount > 0) {
            deliveryStatus = 'PARTIAL';
            failureReason = `${failureCount} of ${tokens.length} devices failed`;
          }

          await notificationRepository.updateDeliveryStatus(
            inAppRecordId,
            deliveryStatus,
            {
              failureReason,
              deliveredAt: sentCount > 0 ? new Date() : null,
            },
          );
        }

        // Deactivate invalid tokens returned by FCM
        if (sendResult.invalidTokens.length > 0) {
          logger.warn(
            { count: sendResult.invalidTokens.length, userId: targetUserAccountId },
            'Deactivating invalid device tokens detected by FCM',
          );
          await notificationRepository.deactivateTokens(sendResult.invalidTokens);
        }
      } catch (pushError: any) {
        const errorMessage =
          pushError instanceof Error ? pushError.message : String(pushError);
        logger.error(
          { recipientUserId: targetUserAccountId, error: errorMessage },
          '[FCM] Push delivery failed unexpectedly; in-app notification preserved',
        );
        failureCount = tokens.length;
        if (inAppRecordId) {
          try {
            await notificationRepository.updateDeliveryStatus(
              inAppRecordId,
              'FAILED',
              {
                failureReason: errorMessage,
              },
            );
          } catch (dbErr: any) {
            logger.warn(
              { error: dbErr },
              'Failed to update notification delivery status to FAILED',
            );
          }
        }
      }
    }

    return {
      sentCount,
      failureCount,
      deactivatedTokens,
    };
  }

  /**
   * Send notification to multiple user accounts with batch database queries and FCM multicasting.
   */
  async sendToUsers(
    userIds: string[],
    payload: NotificationPayload,
    options: {
      saveInApp?: boolean;
      appType?: string;
    } = { saveInApp: true },
  ): Promise<SendNotificationResult> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return { sentCount: 0, failureCount: 0, deactivatedTokens: [] };
    }

    if (options.saveInApp !== false) {
      const batchItems = uniqueUserIds.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        entityType: payload.entityType ?? 'APPOINTMENT',
        entityId: payload.entityId,
        route: payload.route ?? 'AppointmentDetails',
        data: payload.data,
        idempotencyKey: payload.idempotencyKey
          ? `${payload.idempotencyKey}:${userId}`
          : undefined,
        deliveryStatus: 'PENDING' as const,
      }));
      await notificationRepository.createNotificationsBatch(batchItems);
    }

    const devices = await notificationRepository.getActiveTokensForUsers(
      uniqueUserIds,
      options.appType,
    );
    const tokens = devices.map((d) => d.token);

    let sentCount = 0;
    let failureCount = 0;
    let deactivatedTokens: string[] = [];

    if (tokens.length > 0) {
      try {
        const sendResult = await firebaseNotificationService.sendMulticast({
          tokens,
          title: payload.title,
          body: payload.body,
          data: {
            type: payload.type,
            entityType: payload.entityType ?? 'APPOINTMENT',
            entityId: payload.entityId ?? '',
            appointmentId: payload.entityId ?? '',
            route: payload.route ?? 'AppointmentDetails',
            screen: payload.route ?? 'AppointmentDetails',
            ...(payload.data ?? {}),
          },
        });

        sentCount = sendResult.successCount;
        failureCount = sendResult.failureCount;
        deactivatedTokens = sendResult.invalidTokens;

        if (sendResult.invalidTokens.length > 0) {
          await notificationRepository.deactivateTokens(sendResult.invalidTokens);
        }
      } catch (err: any) {
        logger.error({ error: err }, '[FCM] Batch multicast failed');
        failureCount = tokens.length;
      }
    }

    return {
      sentCount,
      failureCount,
      deactivatedTokens,
    };
  }

  /**
   * Helper: Resolve user_account_id for a patient ID.
   */
  async resolveUserAccountForPatient(patientId: string): Promise<string | null> {
    if (!patientId) return null;
    const row = await queryOne<{
      user_account_id: string | null;
      user_id: string | null;
    }>(
      `SELECT user_account_id, user_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 OR user_id::text = $1 LIMIT 1;`,
      [patientId],
    );
    if (row?.user_account_id || row?.user_id) {
      return row.user_account_id || row.user_id;
    }
    const userRow = await queryOne<{ id: string }>(
      `SELECT id FROM user_accounts WHERE id::text = $1 LIMIT 1;`,
      [patientId],
    );
    return userRow?.id || null;
  }

  /**
   * Helper: Resolve user_account_id for a doctor ID.
   */
  async resolveUserAccountForDoctor(doctorId: string): Promise<string | null> {
    if (!doctorId) return null;
    const row = await queryOne<{ user_account_id: string | null }>(
      `SELECT user_account_id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1;`,
      [doctorId],
    );
    if (row?.user_account_id) {
      return row.user_account_id;
    }

    const userRow = await queryOne<{ id: string }>(
      `SELECT id FROM user_accounts WHERE id::text = $1 LIMIT 1;`,
      [doctorId],
    );
    return userRow?.id || null;
  }

  /**
   * Resolves all user IDs (user_account_id and linked clinical entity id) for the authenticated context.
   */
  async resolveUserIdsForContext(user: {
    id: string;
    role: string;
  }): Promise<string[]> {
    const userIds: string[] = [user.id];

    if (user.role === 'patient') {
      const patient = await queryOne<{ id: string }>(
        `SELECT id FROM patients WHERE user_account_id::text = $1 OR id::text = $1 LIMIT 1;`,
        [user.id],
      );
      if (patient?.id && !userIds.includes(patient.id)) {
        userIds.push(patient.id);
      }
    } else if (user.role === 'doctor') {
      const doctor = await queryOne<{ id: string }>(
        `SELECT id FROM doctors WHERE user_account_id::text = $1 OR id::text = $1 LIMIT 1;`,
        [user.id],
      );
      if (doctor?.id && !userIds.includes(doctor.id)) {
        userIds.push(doctor.id);
      }
    }

    return userIds;
  }

  /**
   * High-level helper: Send notification to a patient by patientId.
   */
  async sendToPatient(patientId: string, payload: NotificationPayload) {
    const userAccountId = await this.resolveUserAccountForPatient(patientId);
    if (!userAccountId) {
      logger.warn(
        { patientId },
        '[Appointment] Cannot send push notification: patient has no linked user_account_id',
      );
      return { sentCount: 0, failureCount: 0, deactivatedTokens: [] };
    }
    logger.debug(
      { patientId, resolvedUserAccountId: userAccountId },
      '[Appointment] Notification recipient resolved',
    );
    return this.sendToUser(userAccountId, payload, {
      saveInApp: true,
      appType: 'PATIENT',
    });
  }

  /**
   * High-level helper: Send notification to a doctor by doctorId.
   */
  async sendToDoctor(doctorId: string, payload: NotificationPayload) {
    const userAccountId = await this.resolveUserAccountForDoctor(doctorId);
    if (!userAccountId) {
      logger.warn(
        { doctorId },
        '[Appointment] Cannot send push notification: doctor has no linked user_account_id',
      );
      return { sentCount: 0, failureCount: 0, deactivatedTokens: [] };
    }
    logger.debug(
      { doctorId, resolvedUserAccountId: userAccountId },
      '[Appointment] Notification recipient resolved',
    );
    return this.sendToUser(userAccountId, payload, {
      saveInApp: true,
      appType: 'DOCTOR',
    });
  }
}

export const notificationService = new NotificationService();
