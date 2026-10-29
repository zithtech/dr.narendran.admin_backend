
import type { Message, MulticastMessage, Notification } from 'firebase-admin/messaging';

import { getFirebaseMessaging, isFirebaseConfigured } from '@/config/firebase.js';
import { logger } from '@/lib/logger.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string | null | undefined;
}

export interface SendPushNotificationOptions {
  token: string;
  title: string;
  body: string;
  imageUrl?: string | null | undefined;
  data?: Record<string, unknown> | undefined;
  priority?: 'high' | 'normal' | undefined;
  collapseKey?: string | undefined;
  ttlSeconds?: number | undefined;
}

export interface SendMulticastNotificationOptions {
  tokens: string[];
  title: string;
  body: string;
  imageUrl?: string | null | undefined;
  data?: Record<string, unknown> | undefined;
  priority?: 'high' | 'normal' | undefined;
  collapseKey?: string | undefined;
  ttlSeconds?: number | undefined;
}

export interface SendTopicNotificationOptions {
  topic: string;
  title: string;
  body: string;
  imageUrl?: string | null | undefined;
  data?: Record<string, unknown> | undefined;
  priority?: 'high' | 'normal' | undefined;
}

export interface PushNotificationResponse {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
  isInvalidToken?: boolean | undefined;
  skipped?: boolean | undefined;
}

export interface MulticastNotificationResponse {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  errors: { token: string; error: string; isInvalidToken: boolean }[];
  skipped?: boolean | undefined;
}

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/**
 * Safely masks an FCM device token for logging.
 * Example: "fKm8...3xQ9"
 */
export function maskToken(token: string | null | undefined): string {
  if (!token) return '[empty-token]';
  if (token.length <= 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/**
 * Coerces all payload values in the data object to strings, as required by FCM specifications.
 */
export function coerceDataPayload(
  data?: Record<string, unknown> | null  ,
): Record<string, string> {
  if (!data) return {};

  const stringData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string') {
      stringData[key] = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      stringData[key] = String(value);
    } else {
      stringData[key] = JSON.stringify(value);
    }
  }

  return stringData;
}

/**
 * Resolves the appropriate Android notification channel ID based on notification type.
 */
export function resolveAndroidChannelId(typeOrData?: string | Record<string, string>): string {
  let channelOverride = '';
  let rawType = '';

  if (typeof typeOrData === 'object' && typeOrData !== null) {
    if (typeOrData['channelId'] && typeOrData['channelId'].trim().length > 0) {
      channelOverride = typeOrData['channelId'].trim();
    }
    rawType = typeOrData['type'] || '';
  } else if (typeof typeOrData === 'string') {
    rawType = typeOrData;
  }

  if (channelOverride) return channelOverride;

  const t = rawType.toUpperCase();
  if (t.startsWith('CHAT_') || t.includes('CHAT') || t.includes('MESSAGE')) return 'chat';
  if (t.startsWith('APPOINTMENT_') || t === 'NEW_APPOINTMENT' || t.startsWith('FOLLOW_UP') || t.includes('RESCHEDULE')) return 'appointments';
  if (t.startsWith('PRESCRIPTION_') || t.startsWith('LAB_REPORT_')) return 'prescriptions';
  if (
    t.startsWith('MEDICINE_') ||
    t.startsWith('DOSE_') ||
    t.startsWith('MISSED_') ||
    t.startsWith('DAILY_')
  ) {
    return 'medicines';
  }
  if (t === 'PATIENT_NON_ADHERENCE_ALERT') return 'appointments';
  if (t.startsWith('ORDER_') || t.includes('ORDER')) return 'orders';
  return 'default';
}

/**
 * Service for sending Firebase Cloud Messaging (FCM) push notifications.
 */
export class FirebaseNotificationService {
  /**
   * Send a push notification to a single device token.
   */
  async sendPushNotification(
    options: SendPushNotificationOptions,
  ): Promise<PushNotificationResponse> {
    const { token, title, body, imageUrl, data, priority = 'high', collapseKey, ttlSeconds } = options;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return {
        success: false,
        error: 'Invalid or empty device token',
        isInvalidToken: true,
      };
    }

    if (!isFirebaseConfigured()) {
      logger.debug(
        { tokenMasked: maskToken(token), title },
        'Push notification skipped: Firebase Admin SDK is not configured.',
      );
      return {
        success: false,
        skipped: true,
        error: 'Firebase Admin SDK is not configured.',
      };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      return {
        success: false,
        skipped: true,
        error: 'Firebase Messaging service unavailable.',
      };
    }

    const notificationPayload: Notification = {
      title,
      body,
    };
    if (imageUrl) {
      notificationPayload.imageUrl = imageUrl;
    }

    const stringData = coerceDataPayload(data);
    const androidChannelId = resolveAndroidChannelId(stringData);

    logger.debug({ tokenMasked: maskToken(token), title, channelId: androidChannelId }, '[FCM] Sending notification');
    const message: Message = {
      token: token.trim(),
      notification: notificationPayload,
      data: stringData,
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        ...(collapseKey ? { collapseKey } : {}),
        ...(ttlSeconds ? { ttl: ttlSeconds * 1000 } : {}),
        notification: {
          channelId: androidChannelId,
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': priority === 'high' ? '10' : '5',
          ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    try {
      const messageId = await messaging.send(message);
      logger.debug(
        { messageId, tokenMasked: maskToken(token), title },
        '[FCM] Notification sent successfully',
      );
      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      const errorCode = error?.code || error?.errorInfo?.code || 'UNKNOWN_ERROR';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isInvalid = INVALID_TOKEN_ERROR_CODES.has(errorCode);

      logger.warn(
        {
          errorCode,
          tokenMasked: maskToken(token),
          isInvalidToken: isInvalid,
        },
        '[FCM] Notification send failed',
      );

      return {
        success: false,
        error: errorMessage,
        isInvalidToken: isInvalid,
      };
    }
  }

  /**
   * Send push notifications to multiple device tokens (multicast batching).
   */
  async sendMulticastPushNotification(
    options: SendMulticastNotificationOptions,
  ): Promise<MulticastNotificationResponse> {
    const { tokens, title, body, imageUrl, data, priority = 'high', collapseKey, ttlSeconds } = options;

    const validTokens = (tokens || []).filter(
      (t) => typeof t === 'string' && t.trim().length > 0,
    );

    if (validTokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
        errors: [],
      };
    }

    if (!isFirebaseConfigured()) {
      logger.debug(
        { tokenCount: validTokens.length, title },
        'Multicast push notification skipped: Firebase Admin SDK is not configured.',
      );
      return {
        successCount: 0,
        failureCount: validTokens.length,
        invalidTokens: [],
        errors: [],
        skipped: true,
      };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      return {
        successCount: 0,
        failureCount: validTokens.length,
        invalidTokens: [],
        errors: [],
        skipped: true,
      };
    }

    const notificationPayload: Notification = {
      title,
      body,
    };
    if (imageUrl) {
      notificationPayload.imageUrl = imageUrl;
    }

    const stringData = coerceDataPayload(data);

    // FCM sendEachForMulticast accepts max 500 tokens per call
    const BATCH_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;
    const allInvalidTokens: string[] = [];
    const allErrors: { token: string; error: string; isInvalidToken: boolean }[] = [];

    const androidChannelId = resolveAndroidChannelId(stringData);

    for (let i = 0; i < validTokens.length; i += BATCH_SIZE) {
      const batchTokens = validTokens.slice(i, i + BATCH_SIZE);

      const message: MulticastMessage = {
        tokens: batchTokens,
        notification: notificationPayload,
        data: stringData,
        android: {
          priority: priority === 'high' ? 'high' : 'normal',
          ...(collapseKey ? { collapseKey } : {}),
          ...(ttlSeconds ? { ttl: ttlSeconds * 1000 } : {}),
          notification: {
            channelId: androidChannelId,
            priority: 'max',
            defaultSound: true,
            defaultVibrateTimings: true,
            sound: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': priority === 'high' ? '10' : '5',
            ...(collapseKey ? { 'apns-collapse-id': collapseKey } : {}),
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      try {
        logger.info({ batchSize: batchTokens.length, title }, '[FCM] FCM request sent');
        const response = await messaging.sendEachForMulticast(message);
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        response.responses.forEach((resp, idx) => {
          const currentToken = batchTokens[idx];
          if (!resp.success && currentToken) {
            const errorCode = resp.error?.code || 'UNKNOWN_ERROR';
            const errorMessage = resp.error?.message || 'Delivery failed';
            const isInvalid = INVALID_TOKEN_ERROR_CODES.has(errorCode);

            if (isInvalid) {
              allInvalidTokens.push(currentToken);
            }

            allErrors.push({
              token: currentToken,
              error: errorMessage,
              isInvalidToken: isInvalid,
            });

            logger.error({ tokenMasked: maskToken(currentToken), error: errorMessage }, '[FCM] FCM send failure/error');
          } else if (resp.success && currentToken) {
            logger.info({ tokenMasked: maskToken(currentToken), messageId: resp.messageId }, '[FCM] FCM notification sent successfully');
          }
        });
      } catch (batchError: any) {
        logger.error(
          {
            batchSize: batchTokens.length,
            error: batchError instanceof Error ? batchError.message : String(batchError),
          },
          '[FCM] FCM send failure/error (Batch)',
        );
        totalFailure += batchTokens.length;
      }
    }

    return {
      successCount: totalSuccess,
      failureCount: totalFailure,
      invalidTokens: allInvalidTokens,
      errors: allErrors,
    };
  }

  /**
   * Send a notification to an FCM topic.
   */
  async sendTopicNotification(
    options: SendTopicNotificationOptions,
  ): Promise<PushNotificationResponse> {
    const { topic, title, body, imageUrl, data, priority = 'high' } = options;

    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return {
        success: false,
        error: 'Invalid or empty topic',
      };
    }

    if (!isFirebaseConfigured()) {
      logger.debug(
        { topic, title },
        'Topic notification skipped: Firebase Admin SDK is not configured.',
      );
      return {
        success: false,
        skipped: true,
        error: 'Firebase Admin SDK is not configured.',
      };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      return {
        success: false,
        skipped: true,
        error: 'Firebase Messaging service unavailable.',
      };
    }

    const notificationPayload: Notification = {
      title,
      body,
    };
    if (imageUrl) {
      notificationPayload.imageUrl = imageUrl;
    }

    const stringData = coerceDataPayload(data);

    const message: Message = {
      topic: topic.trim(),
      notification: notificationPayload,
      data: stringData,
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        notification: {
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };

    try {
      const messageId = await messaging.send(message);
      return {
        success: true,
        messageId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Alias for sendPushNotification */
  async send(options: SendPushNotificationOptions): Promise<PushNotificationResponse> {
    return this.sendPushNotification(options);
  }

  /** Alias for sendMulticastPushNotification */
  async sendMulticast(options: SendMulticastNotificationOptions): Promise<MulticastNotificationResponse> {
    return this.sendMulticastPushNotification(options);
  }
}

export const firebaseNotificationService = new FirebaseNotificationService();

