import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '@/http/middleware/authenticate.js';

import { chatController } from './chat.controller.js';

export const chatRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
});

chatRouter.get('/doctors', requireAuth, chatController.getDoctors);
chatRouter.get('/conversations', requireAuth, chatController.getConversations);
chatRouter.post('/conversations', requireAuth, chatController.getOrCreateConversation);
chatRouter.get(
  '/conversations/:conversationId/messages',
  requireAuth,
  chatController.getMessages,
);
chatRouter.get(
  '/conversations/:conversationId/search',
  requireAuth,
  chatController.searchMessages,
);
chatRouter.post(
  '/conversations/:conversationId/attachments',
  requireAuth,
  upload.single('file'),
  chatController.uploadAttachment,
);
chatRouter.get(
  '/conversations/:conversationId/messages/:messageId/attachment',
  requireAuth,
  chatController.getAttachment,
);
chatRouter.post(
  '/conversations/:conversationId/read',
  requireAuth,
  chatController.markAsRead,
);
chatRouter.delete(
  '/conversations/:conversationId/messages/:messageId',
  requireAuth,
  chatController.deleteMessage,
);
