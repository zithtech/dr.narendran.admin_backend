import { query, queryOne } from '@/db/query.js';

import {
  type DeliveryStatus,
  type DeviceTokenRecord,
  type InAppNotificationRecord,
} from './notification.types.js';

interface RawDeviceTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  device_id: string | null;
  app_type: string;
  is_active: boolean;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface RawNotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: Date | null;
  idempotency_key?: string | null;
  delivery_status?: string;
  delivered_at?: Date | null;
  delivery_attempts?: number;
  failure_reason?: string | null;
  created_at: Date;
}

function mapDeviceTokenRow(row: RawDeviceTokenRow): DeviceTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    platform: row.platform,
    deviceId: row.device_id,
    appType: row.app_type,
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotificationRow(row: RawNotificationRow): InAppNotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    route: row.route,
    data: row.data,
    isRead: row.is_read,
    readAt: row.read_at,
    idempotencyKey: row.idempotency_key ?? null,
    deliveryStatus: (row.delivery_status as DeliveryStatus) || 'PENDING',
    deliveredAt: row.delivered_at ?? null,
    deliveryAttempts: row.delivery_attempts ?? 0,
    failureReason: row.failure_reason ?? null,
    createdAt: row.created_at,
  };
}

function normalizeUserIds(userIds: string | string[]): string[] {
  if (Array.isArray(userIds)) {
    return Array.from(
      new Set(userIds.filter((id) => Boolean(id) && id.trim().length > 0)),
    );
  }
  return userIds ? [userIds] : [];
}

export const notificationRepository = {
  /**
   * Register or reactivate a device token for a user.
   */
  async upsertDeviceToken(
    userId: string,
    token: string,
    platform = 'ANDROID',
    appType = 'PATIENT',
    deviceId: string | null = null,
  ): Promise<DeviceTokenRecord> {
    const sql = `
      INSERT INTO notification_device_tokens (
        user_id, token, platform, app_type, device_id, is_active, last_seen_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, true, now(), now(), now())
      ON CONFLICT (user_id, token)
      DO UPDATE SET
        is_active = true,
        platform = EXCLUDED.platform,
        app_type = EXCLUDED.app_type,
        device_id = COALESCE(EXCLUDED.device_id, notification_device_tokens.device_id),
        last_seen_at = now(),
        updated_at = now()
      RETURNING *;
    `;
    const rows = await query<RawDeviceTokenRow>(sql, [
      userId,
      token,
      platform,
      appType,
      deviceId,
    ]);
    return mapDeviceTokenRow(rows[0]!);
  },

  /**
   * Deactivate a specific token for a user (called on logout).
   */
  async deactivateDeviceToken(userId: string, token: string): Promise<boolean> {
    const sql = `
      UPDATE notification_device_tokens
      SET is_active = false, updated_at = now()
      WHERE user_id = $1 AND token = $2
      RETURNING id;
    `;
    const rows = await query<{ id: string }>(sql, [userId, token]);
    return rows.length > 0;
  },

  /**
   * Batch deactivate multiple tokens (e.g. invalid/unregistered tokens returned by FCM).
   */
  async deactivateTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const sql = `
      UPDATE notification_device_tokens
      SET is_active = false, updated_at = now()
      WHERE token = ANY($1::text[]);
    `;
    const rows = await query<{ id: string }>(sql, [tokens]);
    return rows.length;
  },

  /**
   * Retrieve active tokens for a single user, optionally filtered by appType (PATIENT / DOCTOR).
   */
  async getActiveTokensForUser(
    userId: string,
    appType?: string,
  ): Promise<DeviceTokenRecord[]> {
    const sql = appType
      ? `
        SELECT *
        FROM notification_device_tokens
        WHERE user_id = $1 AND app_type = $2 AND is_active = true;
      `
      : `
        SELECT *
        FROM notification_device_tokens
        WHERE user_id = $1 AND is_active = true;
      `;
    const rows = await query<RawDeviceTokenRow>(
      sql,
      appType ? [userId, appType] : [userId],
    );
    return rows.map(mapDeviceTokenRow);
  },

  /**
   * Retrieve active tokens for multiple users in a single query (prevents N+1), optionally filtered by appType.
   */
  async getActiveTokensForUsers(
    userIds: string[],
    appType?: string,
  ): Promise<DeviceTokenRecord[]> {
    if (userIds.length === 0) return [];
    const sql = appType
      ? `
        SELECT *
        FROM notification_device_tokens
        WHERE user_id = ANY($1::uuid[]) AND app_type = $2 AND is_active = true;
      `
      : `
        SELECT *
        FROM notification_device_tokens
        WHERE user_id = ANY($1::uuid[]) AND is_active = true;
      `;
    const rows = await query<RawDeviceTokenRow>(
      sql,
      appType ? [userIds, appType] : [userIds],
    );
    return rows.map(mapDeviceTokenRow);
  },

  /**
   * Save a single in-app notification to the notifications table with idempotency support.
   */
  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string | null | undefined;
    entityId?: string | null | undefined;
    route?: string | null | undefined;
    data?: Record<string, unknown> | null | undefined;
    idempotencyKey?: string | null | undefined;
    deliveryStatus?: DeliveryStatus | undefined;
  }): Promise<InAppNotificationRecord & { isDuplicate?: boolean }> {
    const initialStatus = data.deliveryStatus ?? 'PENDING';

    if (data.idempotencyKey) {
      const insertSql = `
        INSERT INTO notifications (
          user_id, type, title, body, entity_type, entity_id, route, data,
          is_read, idempotency_key, delivery_status, delivery_attempts, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, 0, now())
        ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING *;
      `;
      const rows = await query<RawNotificationRow>(insertSql, [
        data.userId,
        data.type,
        data.title,
        data.body,
        data.entityType ?? null,
        data.entityId ?? null,
        data.route ?? null,
        data.data ? JSON.stringify(data.data) : null,
        data.idempotencyKey,
        initialStatus,
      ]);

      if (rows.length > 0 && rows[0]) {
        return { ...mapNotificationRow(rows[0]), isDuplicate: false };
      }

      // Record already exists for this idempotency key
      const existing = await queryOne<RawNotificationRow>(
        `SELECT * FROM notifications WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1;`,
        [data.userId, data.idempotencyKey],
      );
      if (existing) {
        return { ...mapNotificationRow(existing), isDuplicate: true };
      }
    }

    const sql = `
      INSERT INTO notifications (
        user_id, type, title, body, entity_type, entity_id, route, data,
        is_read, idempotency_key, delivery_status, delivery_attempts, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, 0, now())
      RETURNING *;
    `;
    const rows = await query<RawNotificationRow>(sql, [
      data.userId,
      data.type,
      data.title,
      data.body,
      data.entityType ?? null,
      data.entityId ?? null,
      data.route ?? null,
      data.data ? JSON.stringify(data.data) : null,
      data.idempotencyKey ?? null,
      initialStatus,
    ]);
    return { ...mapNotificationRow(rows[0]!), isDuplicate: false };
  },

  /**
   * Save notifications for multiple users in batch.
   */
  async createNotificationsBatch(
    items: {
      userId: string;
      type: string;
      title: string;
      body: string;
      entityType?: string | null | undefined;
      entityId?: string | null | undefined;
      route?: string | null | undefined;
      data?: Record<string, unknown> | null | undefined;
      idempotencyKey?: string | null | undefined;
      deliveryStatus?: DeliveryStatus | undefined;
    }[],
  ): Promise<InAppNotificationRecord[]> {
    if (items.length === 0) return [];
    const results: InAppNotificationRecord[] = [];
    for (const item of items) {
      const res = await this.createNotification(item);
      results.push(res);
    }
    return results;
  },

  /**
   * Update delivery metadata on an in-app notification record.
   */
  async updateDeliveryStatus(
    id: string,
    status: DeliveryStatus,
    details?: {
      failureReason?: string | null;
      attempts?: number;
      deliveredAt?: Date | null;
    },
  ): Promise<boolean> {
    const deliveredAt =
      details?.deliveredAt !== undefined
        ? details.deliveredAt
        : status === 'SENT'
          ? new Date()
          : null;

    const sql = `
      UPDATE notifications
      SET delivery_status = $2::varchar,
          delivery_attempts = COALESCE($3::integer, delivery_attempts + 1),
          failure_reason = $4::text,
          delivered_at = COALESCE($5::timestamptz, delivered_at)
      WHERE id = $1::uuid
      RETURNING id;
    `;
    const rows = await query<{ id: string }>(sql, [
      id,
      status,
      details?.attempts !== undefined ? details.attempts : null,
      details?.failureReason ?? null,
      deliveredAt,
    ]);
    return rows.length > 0;
  },

  /**
   * Get user notification history with pagination and multi-identifier alias support.
   */
  async getUserNotifications(
    userIds: string | string[],
    limit = 20,
    offset = 0,
    isRead?: boolean,
    type?: string,
  ): Promise<{ notifications: InAppNotificationRecord[]; total: number }> {
    const normalizedIds = normalizeUserIds(userIds);
    if (normalizedIds.length === 0) {
      return { notifications: [], total: 0 };
    }

    const conditions: string[] = ['user_id = ANY($1::uuid[])'];
    const params: (string[] | boolean | number | string)[] = [normalizedIds];

    if (isRead !== undefined) {
      params.push(isRead);
      conditions.push(`is_read = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `SELECT count(*)::int AS count FROM notifications WHERE ${whereClause};`;
    const countRow = await queryOne<{ count: number }>(countSql, params);
    const total = countRow?.count ?? 0;

    const listParams = [...params, limit, offset];
    const listLimitIdx = listParams.length - 1;
    const listOffsetIdx = listParams.length;

    const listSql = `
      SELECT *
      FROM notifications
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${listLimitIdx} OFFSET $${listOffsetIdx};
    `;

    const rows = await query<RawNotificationRow>(listSql, listParams);
    return {
      notifications: rows.map(mapNotificationRow),
      total,
    };
  },

  /**
   * Get total unread count for user across all resolved aliases.
   */
  async getUnreadCount(userIds: string | string[]): Promise<number> {
    const normalizedIds = normalizeUserIds(userIds);
    if (normalizedIds.length === 0) return 0;

    const sql = `
      SELECT count(*)::int AS count
      FROM notifications
      WHERE user_id = ANY($1::uuid[]) AND is_read = false;
    `;
    const row = await queryOne<{ count: number }>(sql, [normalizedIds]);
    return row?.count ?? 0;
  },

  /**
   * Mark a single notification as read if owned by any of userIds.
   */
  async markAsRead(
    userIds: string | string[],
    notificationId: string,
  ): Promise<boolean> {
    const normalizedIds = normalizeUserIds(userIds);
    if (normalizedIds.length === 0) return false;

    const sql = `
      UPDATE notifications
      SET is_read = true, read_at = now()
      WHERE user_id = ANY($1::uuid[]) AND id = $2 AND is_read = false
      RETURNING id;
    `;
    const rows = await query<{ id: string }>(sql, [
      normalizedIds,
      notificationId,
    ]);
    return rows.length > 0;
  },

  /**
   * Mark all notifications for a user as read across all resolved aliases.
   */
  async markAllAsRead(userIds: string | string[]): Promise<number> {
    const normalizedIds = normalizeUserIds(userIds);
    if (normalizedIds.length === 0) return 0;

    const sql = `
      UPDATE notifications
      SET is_read = true, read_at = now()
      WHERE user_id = ANY($1::uuid[]) AND is_read = false
      RETURNING id;
    `;
    const rows = await query<{ id: string }>(sql, [normalizedIds]);
    return rows.length;
  },

  /**
   * Server-side authorization check: verify if a user has access to a referenced clinical entity.
   */
  async verifyEntityOwnership(
    userIds: string | string[],
    entityType: string,
    entityId: string,
  ): Promise<boolean> {
    const normalizedIds = normalizeUserIds(userIds);
    if (normalizedIds.length === 0 || !entityId) return false;

    const type = entityType.toUpperCase();
    if (type === 'APPOINTMENT') {
      const row = await queryOne<{ id: string }>(
        `SELECT id FROM appointments 
         WHERE id::text = $1 AND (patient_id::text = ANY($2::text[]) OR doctor_id::text = ANY($2::text[]))
         LIMIT 1;`,
        [entityId, normalizedIds],
      );
      return Boolean(row);
    }

    if (type === 'CONVERSATION' || type === 'CHAT') {
      const row = await queryOne<{ id: string }>(
        `SELECT id FROM chat_conversations 
         WHERE id::text = $1 AND (patient_id::text = ANY($2::text[]) OR doctor_id::text = ANY($2::text[]))
         LIMIT 1;`,
        [entityId, normalizedIds],
      );
      return Boolean(row);
    }

    if (type === 'PRESCRIPTION') {
      const row = await queryOne<{ id: string }>(
        `SELECT id FROM prescriptions 
         WHERE id::text = $1 AND (patient_id::text = ANY($2::text[]) OR doctor_id::text = ANY($2::text[]))
         LIMIT 1;`,
        [entityId, normalizedIds],
      );
      return Boolean(row);
    }

    // By default for non-clinical entities, access is permitted if the user owns the notification itself
    return true;
  },

  /**
   * Verify if a doctor user account is associated with a target patient.
   */
  async isDoctorAssociatedWithPatient(
    doctorUserId: string,
    patientId: string,
  ): Promise<boolean> {
    const doctorRow = await queryOne<{ id: string }>(
      'SELECT id FROM doctors WHERE user_account_id::text = $1 OR id::text = $1 LIMIT 1;',
      [doctorUserId],
    );
    const doctorId = doctorRow?.id || doctorUserId;

    const patientRow = await queryOne<{
      id: string;
      user_account_id: string | null;
    }>(
      'SELECT id, user_account_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1;',
      [patientId],
    );
    const resolvedPatientId = patientRow?.id || patientId;
    const resolvedUserAccountId = patientRow?.user_account_id || patientId;

    const sql = `
      SELECT 1 FROM appointments WHERE doctor_id::text = $1 AND (patient_id::text = $2 OR patient_id::text = $3)
      UNION
      SELECT 1 FROM chat_conversations WHERE doctor_id::text = $1 AND (patient_id::text = $2 OR patient_id::text = $3)
      UNION
      SELECT 1 FROM prescriptions WHERE doctor_id::text = $1 AND (patient_id::text = $2 OR patient_id::text = $3)
      LIMIT 1;
    `;
    const row = await queryOne<{ '?column?': number }>(sql, [
      doctorId,
      resolvedPatientId,
      resolvedUserAccountId,
    ]);
    return Boolean(row);
  },
};
