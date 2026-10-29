import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
const mockSendEachForMulticast = vi.fn();

vi.mock('@/config/firebase.js', () => ({
  isFirebaseConfigured: vi.fn(() => true),
  getFirebaseMessaging: vi.fn(() => ({
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

describe('Firebase Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. masks FCM tokens properly for safe logging without leaking full token', async () => {
    const { maskToken } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );

    expect(maskToken('fKm8aBcdEf1234567890zXyW3xQ9')).toBe('fKm8aB...3xQ9');
    expect(maskToken('short')).toBe('***');
    expect(maskToken('')).toBe('[empty-token]');
    expect(maskToken(null)).toBe('[empty-token]');
    expect(maskToken(undefined)).toBe('[empty-token]');
  });

  it('2. coerces data payload values to strings and JSON-stringifies nested objects', async () => {
    const { coerceDataPayload } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );

    const data = {
      appointmentId: 'appt-123',
      retryCount: 3,
      isEmergency: true,
      metadata: { doctorId: 'doc-456', priority: 'high' },
      nullable: null,
      undef: undefined,
    };

    const coerced = coerceDataPayload(data);

    expect(coerced['appointmentId']).toBe('appt-123');
    expect(coerced['retryCount']).toBe('3');
    expect(coerced['isEmergency']).toBe('true');
    expect(coerced['metadata']).toBe('{"doctorId":"doc-456","priority":"high"}');
    expect(coerced['nullable']).toBeUndefined();
    expect(coerced['undef']).toBeUndefined();

    // Verify all values are strictly strings
    for (const val of Object.values(coerced)) {
      expect(typeof val).toBe('string');
    }
  });

  it('3. sends a single push notification with correct message structure', async () => {
    const { FirebaseNotificationService } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );
    mockSend.mockResolvedValue('projects/test-app/messages/msg-001');

    const service = new FirebaseNotificationService();
    const result = await service.sendPushNotification({
      token: 'fcm-device-token-1234567890',
      title: 'Appointment Confirmed',
      body: 'Your consultation with Dr. S. Narendran is confirmed for tomorrow.',
      imageUrl: 'https://example.com/banner.png',
      data: {
        appointmentId: 'appt-999',
        type: 'APPOINTMENT_CONFIRMED',
      },
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('projects/test-app/messages/msg-001');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'fcm-device-token-1234567890',
        notification: {
          title: 'Appointment Confirmed',
          body: 'Your consultation with Dr. S. Narendran is confirmed for tomorrow.',
          imageUrl: 'https://example.com/banner.png',
        },
        data: {
          appointmentId: 'appt-999',
          type: 'APPOINTMENT_CONFIRMED',
        },
      }),
    );
  });

  it('4. detects invalid/unregistered tokens and returns isInvalidToken: true', async () => {
    const { FirebaseNotificationService } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );
    const error = new Error('Requested entity was not found.');
    (error as any).code = 'messaging/registration-token-not-registered';
    mockSend.mockRejectedValue(error);

    const service = new FirebaseNotificationService();
    const result = await service.sendPushNotification({
      token: 'expired-token-1234567890',
      title: 'Test',
      body: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.isInvalidToken).toBe(true);
    expect(result.error).toContain('Requested entity was not found');
  });

  it('5. sends multicast notification to multiple devices and records invalid tokens', async () => {
    const { FirebaseNotificationService } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );

    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 1,
      responses: [
        { success: true, messageId: 'msg-1' },
        {
          success: false,
          error: {
            code: 'messaging/invalid-registration-token',
            message: 'The registration token is not a valid FCM registration token',
          },
        },
        { success: true, messageId: 'msg-3' },
      ],
    });

    const service = new FirebaseNotificationService();
    const result = await service.sendMulticastPushNotification({
      tokens: ['valid-token-1', 'invalid-token-2', 'valid-token-3'],
      title: 'Clinic Update',
      body: 'New prescription has been uploaded.',
    });

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.invalidTokens).toEqual(['invalid-token-2']);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.isInvalidToken).toBe(true);
  });

  it('6. sends topic notifications successfully', async () => {
    const { FirebaseNotificationService } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );
    mockSend.mockResolvedValue('projects/test-app/messages/topic-msg-001');

    const service = new FirebaseNotificationService();
    const result = await service.sendTopicNotification({
      topic: 'doctors_announcements',
      title: 'New Clinical Protocol',
      body: 'Updated oncology guidelines are now available.',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('projects/test-app/messages/topic-msg-001');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'doctors_announcements',
      }),
    );
  });

  it('7. gracefully skips push notifications when Firebase is not configured without throwing', async () => {
    const { isFirebaseConfigured } = await import('@/config/firebase.js');
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);

    const { FirebaseNotificationService } = await import(
      '@/modules/notifications/firebaseNotification.service.js'
    );

    const service = new FirebaseNotificationService();
    const result = await service.sendPushNotification({
      token: 'fcm-device-token-1234567890',
      title: 'Skipped Notification',
      body: 'This should not crash',
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain('not configured');
  });
});
