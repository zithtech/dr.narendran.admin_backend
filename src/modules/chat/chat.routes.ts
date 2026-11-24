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

const canReadChat = requirePermissionOrPatient('CHAT', 'read', ['SUPPORT', 'PATIENT_SUPPORT', 'DOCTOR_SUPPORT']);
const canCreateChat = requirePermissionOrPatient('CHAT', 'create', ['CHAT', 'SUPPORT', 'PATIENT_SUPPORT', 'DOCTOR_SUPPORT']);
const canDeleteChat = requirePermissionOrPatient('CHAT', 'delete', ['CHAT']);

chatRouter.get('/doctors', requireAuth, canReadChat, chatController.getDoctors);
chatRouter.get('/patients', requireAuth, canReadChat, chatController.getPatients);
chatRouter.get('/others', requireAuth, canReadChat, chatController.getOtherUsers);
chatRouter.get('/admins', requireAuth, canReadChat, chatController.getOtherUsers);
chatRouter.get('/recipients', requireAuth, canReadChat, chatController.getRecipients);
chatRouter.get('/conversations', requireAuth, canReadChat, chatController.getConversations);
chatRouter.post('/conversations', requireAuth, canCreateChat, chatController.getOrCreateConversation);
chatRouter.get(
  '/conversations/:conversationId/messages',
  requireAuth,
  canReadChat,
  chatController.getMessages,
);
chatRouter.get(
  '/conversations/:conversationId/search',
  requireAuth,
  canReadChat,
  chatController.searchMessages,
);
chatRouter.post(
  '/conversations/:conversationId/attachments',
  requireAuth,
  canCreateChat,
  upload.single('file'),
  chatController.uploadAttachment,
);
chatRouter.get(
  '/conversations/:conversationId/messages/:messageId/attachment',
  requireAuth,
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
  canDeleteChat,
  chatController.deleteMessage,
);
