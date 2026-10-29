import { type Request, type Response } from 'express';
import { type z } from 'zod';

import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/http/errors.js';

import { notificationRepository } from './notification.repository.js';
import { notificationService } from './notification.service.js';
import {
  registerDeviceTokenSchema,
  sendNotificationSchema,
  testNotificationSchema,
  unregisterDeviceTokenSchema,
} from './notification.types.js';

function parseWithValidation<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('That request was not valid.', {
      details: {
        source: 'body',
        issues: result.error.issues,
      },
      cause: result.error,
    });
  }
  return result.data;
}

export const notificationController = {
  /**
   * Send notification to a specific patient or doctor.
   * POST /api/notifications/send
   */
  async sendNotification(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const input = parseWithValidation(sendNotificationSchema, req.body);

    // If requester is a DOCTOR, enforce authorization: doctor can only notify patients associated with them
    if (req.user.role === 'doctor') {
      const isAuthorized =
        await notificationRepository.isDoctorAssociatedWithPatient(
          req.user.id,
          input.recipientId,
        );
      if (!isAuthorized) {
        throw new ForbiddenError(
          'You are not authorized to send notifications to this patient',
        );
      }
    }

    let result;
    if (input.recipientType === 'PATIENT') {
      result = await notificationService.sendToPatient(input.recipientId, {
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Record<string, string>,
      });
    } else {
      result = await notificationService.sendToDoctor(input.recipientId, {
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Record<string, string>,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      data: result,
    });
  },

  /**
   * Safe test push notification endpoint (development / verification).
   * POST /api/notifications/test
   */
  async sendTestNotification(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const input = parseWithValidation(testNotificationSchema, req.body);
    const result = await notificationService.sendToUser(req.user.id, {
      type: (input.data?.['type'] as string) || 'GENERAL',
      title: input.title,
      body: input.body,
      data: input.data as Record<string, string>,
    });
    res.status(200).json({
      success: true,
      message: 'Test notification dispatched',
      data: result,
    });
  },

  /**
   * Register or reactivate device FCM token.
   * POST /api/notifications/devices/register
   */
  async registerDevice(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const input = parseWithValidation(registerDeviceTokenSchema, req.body);
    const device = await notificationService.registerDevice(req.user.id, input);
    res.status(200).json({
      success: true,
      message: 'Device registered successfully',
      data: device,
    });
  },

  /**
   * Unregister / deactivate device FCM token on logout.
   * DELETE /api/notifications/devices
   */
  async unregisterDevice(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const input = parseWithValidation(unregisterDeviceTokenSchema, req.body);
    const deactivated = await notificationService.unregisterDevice(
      req.user.id,
      input.token,
    );
    res.status(200).json({
      success: true,
      message: deactivated
        ? 'Device unregistered successfully'
        : 'Token not found or already deactivated',
    });
  },

  /**
   * List in-app notifications for authenticated user with pagination and alias resolution.
   * GET /api/notifications
   */
  async getNotifications(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const limit = Math.min(
      Math.max(parseInt((req.query['limit'] as string) || '20', 10), 1),
      100,
    );
    const page = Math.max(parseInt((req.query['page'] as string) || '1', 10), 1);
    const offset = (page - 1) * limit;

    let isRead: boolean | undefined = undefined;
    if (req.query['isRead'] === 'true') isRead = true;
    else if (req.query['isRead'] === 'false') isRead = false;

    const userIds = await notificationService.resolveUserIdsForContext(req.user);

    const result = await notificationRepository.getUserNotifications(
      userIds,
      limit,
      offset,
      isRead,
    );

    res.status(200).json({
      success: true,
      data: result.notifications,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  },

  /**
   * Get unread notification count across all user aliases.
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const userIds = await notificationService.resolveUserIdsForContext(req.user);
    const count = await notificationRepository.getUnreadCount(userIds);
    res.status(200).json({
      success: true,
      count,
    });
  },

  /**
   * Mark a single notification as read.
   * PATCH /api/notifications/:id/read
   */
  async markAsRead(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const notificationId = Array.isArray(req.params['id'])
      ? req.params['id'][0]
      : req.params['id'];
    if (!notificationId) {
      res.status(400).json({ success: false, message: 'Notification ID is required' });
      return;
    }
    const userIds = await notificationService.resolveUserIdsForContext(req.user);
    const success = await notificationRepository.markAsRead(
      userIds,
      notificationId,
    );
    if (!success) {
      throw new NotFoundError('Notification not found or access denied');
    }
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  },

  /**
   * Mark all notifications for user as read.
   * PATCH /api/notifications/read-all
   */
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const userIds = await notificationService.resolveUserIdsForContext(req.user);
    const count = await notificationRepository.markAllAsRead(userIds);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      count,
    });
  },

  /**
   * Server-side authorization check for notification deep-link destination.
   * GET /api/notifications/:id/destination
   */
  async getNotificationDestination(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    const notificationId = Array.isArray(req.params['id'])
      ? req.params['id'][0]
      : req.params['id'];
    if (!notificationId) {
      res.status(400).json({ success: false, message: 'Notification ID is required' });
      return;
    }

    const userIds = await notificationService.resolveUserIdsForContext(req.user);
    const result = await notificationRepository.getUserNotifications(
      userIds,
      1,
      0,
    );
    const notif = result.notifications.find((n) => n.id === notificationId);

    if (!notif) {
      throw new NotFoundError('Notification not found or access denied');
    }

    if (notif.entityType && notif.entityId) {
      const isAuthorized = await notificationRepository.verifyEntityOwnership(
        userIds,
        notif.entityType,
        notif.entityId,
      );
      if (!isAuthorized) {
        throw new ForbiddenError(
          'You do not have permission to access the destination of this notification',
        );
      }
    }

    res.status(200).json({
      success: true,
      data: {
        notificationId: notif.id,
        route: notif.route,
        entityType: notif.entityType,
        entityId: notif.entityId,
        data: notif.data,
      },
    });
  },
};
