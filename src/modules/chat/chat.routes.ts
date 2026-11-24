import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '@/http/middleware/authenticate.js';
import { requirePermissionOrPatient } from '@/http/middleware/rbac.middleware.js';

import { chatController } from './chat.controller.js';

export const chatRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
});

const chatFallbackSlugs = ['SUPPORT', 'PATIENT_SUPPORT', 'DOCTOR_SUPPORT'];

chatRouter.get(
  '/doctors',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getDoctors,
);
chatRouter.get(
  '/patients',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getPatients,
);
chatRouter.get(
  '/others',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getOtherUsers,
);
chatRouter.get(
  '/admins',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getOtherUsers,
);
chatRouter.get(
  '/recipients',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getRecipients,
);
chatRouter.get(
  '/conversations',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getConversations,
);
chatRouter.post(
  '/conversations',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'create', chatFallbackSlugs),
  chatController.getOrCreateConversation,
);
chatRouter.get(
  '/conversations/:conversationId/messages',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getMessages,
);
chatRouter.get(
  '/conversations/:conversationId/search',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.searchMessages,
);
chatRouter.post(
  '/conversations/:conversationId/attachments',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'create', chatFallbackSlugs),
  upload.single('file'),
  chatController.uploadAttachment,
);
chatRouter.get(
  '/conversations/:conversationId/messages/:messageId/attachment',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  chatController.getAttachment,
);
chatRouter.post(
  '/conversations/:conversationId/read',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'update', chatFallbackSlugs),
  chatController.markAsRead,
);
chatRouter.delete(
  '/conversations/:conversationId/messages/:messageId',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'delete', chatFallbackSlugs),
  chatController.deleteMessage,
);
