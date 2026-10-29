import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError, ValidationError } from '@/http/errors.js';

import { chatService } from './chat.service.js';

export class ChatController {
  async getDoctors(req: Request, res: Response, next: NextFunction) {
    try {
      const speciality = req.query['speciality'] as string | undefined;
      const search = (req.query['search'] || req.query['q']) as string | undefined;
      const currentUserId = req.user?.id;

      let patientId: string | undefined = undefined;
      if (currentUserId && req.user?.role === 'patient') {
        const identity = await chatService.resolveUserIdentity(currentUserId, 'patient');
        patientId = identity.patientId;
      }

      const doctors = await chatService.getDoctors(
        speciality,
        search,
        patientId,
      );

      res.status(200).json({
        success: true,
        data: doctors,
      });
    } catch (error) {
      next(error);
    }
  }

  async getConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      const conversations = await chatService.getConversations(userId, role);

      res.status(200).json({
        success: true,
        data: conversations,
        conversations,
      });

    } catch (error) {
      next(error);
    }
  }

  async getOrCreateConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const body = req.body as Record<string, unknown> | undefined;
      const doctorId = (
        body?.['doctor_id'] ||
        body?.['doctorId'] ||
        body?.['target_doctor_id'] ||
        body?.['targetDoctorId']
      ) as string | undefined;

      const patientId = (
        body?.['patient_id'] ||
        body?.['patientId'] ||
        body?.['target_patient_id'] ||
        body?.['targetPatientId']
      ) as string | undefined;

      const recipientId = (
        body?.['recipient_id'] ||
        body?.['recipientId'] ||
        body?.['target_user_id'] ||
        body?.['targetUserId'] ||
        body?.['user_id'] ||
        body?.['userId'] ||
        body?.['id']
      ) as string | undefined;

      const conversation = await chatService.getOrCreateConversation(
        userId,
        role,
        doctorId,
        patientId,
        recipientId,
      );

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const conversationId = req.params['conversationId'] as string;
      const limitQuery = req.query['limit'];
      const limit = limitQuery ? parseInt(limitQuery as string, 10) : 30;
      const before = req.query['before'] as string | undefined;

      const messages = await chatService.getMessages(
        conversationId,
        userId,
        role,
        limit,
        before,
      );

      res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const conversationId = req.params['conversationId'] as string;
      const query = (req.query['q'] || req.query['query']) as string | undefined;
      const limitQuery = req.query['limit'];
      const offsetQuery = req.query['offset'];
      const limit = limitQuery ? parseInt(limitQuery as string, 10) : 30;
      const offset = offsetQuery ? parseInt(offsetQuery as string, 10) : 0;

      if (!query || !query.trim()) {
        res.status(200).json({
          success: true,
          data: {
            query: '',
            total: 0,
            results: [],
          },
        });
        return;
      }

      const results = await chatService.searchMessages(
        conversationId,
        userId,
        role,
        query.trim(),
        limit,
        offset,
      );

      res.status(200).json({
        success: true,
        data: {
          query: query.trim(),
          total: results.length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }
      const conversationId = req.params['conversationId'] as string;
      if (!conversationId) {
        throw new ValidationError('Conversation ID is required.');
      }

      let buffer: Buffer;
      let fileName: string;
      let mimeType: string;
      let fileSize: number;

      if (req.file) {
        buffer = req.file.buffer;
        fileName = req.file.originalname || `attachment_${Date.now()}`;
        mimeType = req.file.mimetype;
        fileSize = req.file.size;
      } else if (req.body?.fileBase64 || req.body?.base64 || req.body?.file) {
        const rawBase64 = req.body.fileBase64 || req.body.base64 || req.body.file?.base64 || req.body.file;
        const cleanBase64 =
          typeof rawBase64 === 'string' && rawBase64.includes('base64,')
            ? rawBase64.split('base64,')[1]
            : rawBase64;
        buffer = Buffer.from(cleanBase64, 'base64');
        fileName = req.body.fileName || req.body.file?.fileName || `attachment_${Date.now()}`;
        mimeType = req.body.fileType || req.body.file?.fileType || req.body.mimeType || 'application/octet-stream';
        fileSize = buffer.length;
      } else {
        throw new ValidationError('File is required for upload.');
      }

      const caption = (req.body?.caption || req.body?.message) as string | undefined;
      const replyToMessageId = (req.body?.reply_to_message_id || req.body?.replyToMessageId) as string | undefined;

      const message = await chatService.uploadAttachment(
        conversationId,
        req.user.id,
        req.user.role,
        {
          buffer,
          fileName,
          mimeType,
          fileSize,
        },
        caption,
        replyToMessageId,
      );

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }
      const conversationId = req.params['conversationId'] as string;
      const messageId = req.params['messageId'] as string;

      const result = await chatService.getAttachmentSignedUrl(
        conversationId,
        messageId,
        req.user.id,
        req.user.role,
      );

      if (req.query['redirect'] === 'true') {
        res.redirect(result.downloadUrl);
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const conversationId = req.params['conversationId'] as string;
      const body = req.body as Record<string, unknown> | undefined;
      const messageIds = body?.['messageIds'] as string[] | undefined;

      const readIds = await chatService.markAsRead(
        conversationId,
        userId,
        role,
        messageIds,
      );

      res.status(200).json({
        success: true,
        data: { readIds },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const conversationId = req.params['conversationId'] as string;
      const messageId = req.params['messageId'] as string;

      const deleted = await chatService.deleteMessage(
        conversationId,
        messageId,
        userId,
        role,
      );

      res.status(200).json({
        success: true,
        data: deleted,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
