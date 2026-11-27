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

const canReadChat = requirePermissionOrPatient('CHAT', 'read', ['SUPPORT', 'PATIENT_SUPPORT', 'DOCTOR_SUPPORT']);
const canCreateChat = requirePermissionOrPatient('CHAT', 'create', ['CHAT', 'SUPPORT', 'PATIENT_SUPPORT', 'DOCTOR_SUPPORT']);
const canDeleteChat = requirePermissionOrPatient('CHAT', 'delete', ['CHAT']);

chatRouter.get(
  '/doctors',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getDoctors,
);
chatRouter.get(
  '/patients',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getPatients,
);
chatRouter.get(
  '/others',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getOtherUsers,
);
chatRouter.get(
  '/admins',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getOtherUsers,
);
chatRouter.get(
  '/recipients',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getRecipients,
);
chatRouter.get(
  '/conversations',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat, chatController.getConversations,
);
chatRouter.post(
  '/conversations',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'create', chatFallbackSlugs),
  canCreateChat, chatController.getOrCreateConversation,
);
chatRouter.get(
  '/conversations/:conversationId/messages',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat,
  chatController.getMessages,
);
chatRouter.get(
  '/conversations/:conversationId/search',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat,
  chatController.searchMessages,
);
chatRouter.post(
  '/conversations/:conversationId/attachments',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'create', chatFallbackSlugs),
  canCreateChat,
  upload.single('file'),
  chatController.uploadAttachment,
);
chatRouter.get(
  '/conversations/:conversationId/messages/:messageId/attachment',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'read', chatFallbackSlugs),
  canReadChat,
  chatController.getAttachment,
);
chatRouter.post(
  '/conversations/:conversationId/read',
  requireAuth,
  canReadChat,
  chatController.markAsRead,
);
chatRouter.delete(
  '/conversations/:conversationId/messages/:messageId',
  requireAuth,
  requirePermissionOrPatient('CHAT', 'delete', chatFallbackSlugs),
  canDeleteChat,
  chatController.deleteMessage,
);
