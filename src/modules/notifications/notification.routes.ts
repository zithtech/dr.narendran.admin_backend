import { Router } from 'express';

import { requireAuth } from '@/http/middleware/authenticate.js';

import { notificationController } from './notification.controller.js';

export const notificationsRouter: Router = Router();

// All notification endpoints require authenticated session
notificationsRouter.use(requireAuth);

// Development / Verification test notification endpoint
notificationsRouter.post('/test', notificationController.sendTestNotification);
notificationsRouter.post('/send', notificationController.sendNotification);

// Device token registration & unregistration
notificationsRouter.post('/devices/register', notificationController.registerDevice);
notificationsRouter.delete('/devices', notificationController.unregisterDevice);

// In-app notifications & unread counts
notificationsRouter.get('/', notificationController.getNotifications);
notificationsRouter.get('/unread-count', notificationController.getUnreadCount);
notificationsRouter.patch('/:id/read', notificationController.markAsRead);
notificationsRouter.patch('/read-all', notificationController.markAllAsRead);

// Server-side authorization check for notification deep-link destination
notificationsRouter.get('/:id/destination', notificationController.getNotificationDestination);
