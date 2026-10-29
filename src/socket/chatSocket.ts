import type { Server, Socket } from 'socket.io';

import { logger } from '@/lib/logger.js';
import * as chatRepo from '@/modules/chat/chat.repository.js';
import { chatService } from '@/modules/chat/chat.service.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { NotificationType } from '@/modules/notifications/notification.types.js';

import { presenceManager } from './presenceManager.js';
import { getConversationRoom, getUserRoom } from './socketRooms.js';

export function registerChatSocketHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user;
  const userId = socket.data.userId || user?.id;
  const userRole = socket.data.role || user?.role;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  // Multi-device presence tracking
  presenceManager.addUserSocket(userId, socket.id);
  if (user.patientId && user.patientId !== userId) {
    presenceManager.addUserSocket(user.patientId, socket.id);
  }
  if (user.doctorId && user.doctorId !== userId) {
    presenceManager.addUserSocket(user.doctorId, socket.id);
  }

  // Join personal user room for direct events
  void socket.join(getUserRoom(userId));
  if (user.patientId) void socket.join(getUserRoom(user.patientId));
  if (user.doctorId) void socket.join(getUserRoom(user.doctorId));

  // Catch up undelivered messages for this newly connected user
  void (async () => {
    try {
      const resolved = await chatService.resolveUserIdentity(userId, userRole);
      const recipientIds = resolved.senderType === 'PATIENT'
        ? (resolved.patientIds || [resolved.patientId || userId])
        : (resolved.doctorIds || [resolved.doctorId || userId]);

      const deliveredList = await chatRepo.markPendingMessagesDeliveredForRecipient(
        recipientIds,
        resolved.senderType,
      );

      for (const item of deliveredList) {
        if (item.messageIds && item.messageIds.length > 0) {
          const deliveryPayload = {
            conversationId: item.conversationId,
            conversation_id: item.conversationId,
            messageIds: item.messageIds,
            deliveredAt: new Date().toISOString(),
          };
          const convRoom = getConversationRoom(item.conversationId);
          io.to(convRoom).emit('chat:message:delivered', deliveryPayload);
          io.to(`conversation:${item.conversationId}`).emit('chat:message:delivered', deliveryPayload);
          io.to(convRoom).emit('chat:delivery', deliveryPayload);
          io.to(`conversation:${item.conversationId}`).emit('chat:delivery', deliveryPayload);
          if (item.senderUserId) {
            io.to(getUserRoom(item.senderUserId)).emit('chat:message:delivered', deliveryPayload);
            io.to(getUserRoom(item.senderUserId)).emit('chat:delivery', deliveryPayload);
          }
        }
      }
    } catch {
      // Ignore background catch-up errors
    }
  })();

  const handleJoin = async (
    data: { conversationId: string },
    callback?: (res: { success: boolean; error?: string }) => void,
  ) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId) {
        callback?.({ success: false, error: 'conversationId is required' });
        return;
      }

      const { conversation, senderType } = await chatService.authorizeConversation(
        conversationId,
        userId,
        userRole,
      );

      const convRoom = getConversationRoom(conversationId);
      void socket.join(convRoom);
      void socket.join(`conversation:${conversationId}`);

      // Register presence for active conversation
      presenceManager.joinConversation(userId, socket.id, conversationId);
      if (user.patientId && user.patientId !== userId) {
        presenceManager.joinConversation(user.patientId, socket.id, conversationId);
      }
      if (user.doctorId && user.doctorId !== userId) {
        presenceManager.joinConversation(user.doctorId, socket.id, conversationId);
      }

      logger.debug(
        { userId, socketId: socket.id, conversationId },
        '[Chat] User joined conversation',
      );

      // Mark incoming unread messages as read upon joining conversation
      const readIds = await chatRepo.markMessagesAsRead(
        conversationId,
        senderType,
      );

      if (readIds.length > 0) {
        const readPayload = {
          conversationId,
          conversation_id: conversationId,
          messageIds: readIds,
          readAt: new Date().toISOString(),
        };
        io.to(convRoom).emit('chat:message:read', readPayload);
        io.to(`conversation:${conversationId}`).emit('chat:message:read', readPayload);
        io.to(convRoom).emit('chat:read', readPayload);
        io.to(`conversation:${conversationId}`).emit('chat:read', readPayload);

        const recipientUserId = await chatService.getRecipientUserId(conversation, senderType);
        if (recipientUserId) {
          io.to(getUserRoom(recipientUserId)).emit('chat:message:read', readPayload);
          io.to(getUserRoom(recipientUserId)).emit('chat:read', readPayload);
        }
      }

      socket.emit('chat:joined', { conversationId });
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err?.message || 'Join failed' });
      socket.emit('chat:error', {
        code: 'JOIN_ERROR',
        message: err?.message || 'Failed to join conversation',
      });
    }
  };

  const handleLeave = (data: { conversationId: string }) => {
    const { conversationId } = data || {};
    if (conversationId) {
      const convRoom = getConversationRoom(conversationId);
      void socket.leave(convRoom);
      void socket.leave(`conversation:${conversationId}`);

      presenceManager.leaveConversation(userId, socket.id, conversationId);
      if (user.patientId && user.patientId !== userId) {
        presenceManager.leaveConversation(user.patientId, socket.id, conversationId);
      }
      if (user.doctorId && user.doctorId !== userId) {
        presenceManager.leaveConversation(user.doctorId, socket.id, conversationId);
      }

      logger.debug(
        { userId, socketId: socket.id, conversationId },
        '[Chat] User left conversation',
      );
    }
  };

  // --- chat:join / CHAT_OPENED ---
  socket.on('chat:join', handleJoin);
  socket.on('CHAT_OPENED', handleJoin);

  // --- chat:leave / CHAT_CLOSED ---
  socket.on('chat:leave', handleLeave);
  socket.on('CHAT_CLOSED', handleLeave);

  // --- chat:heartbeat ---
  socket.on('chat:heartbeat', (data: { conversationId: string }) => {
    if (data?.conversationId) {
      presenceManager.heartbeat(userId, socket.id, data.conversationId);
      if (user.patientId && user.patientId !== userId) {
        presenceManager.heartbeat(user.patientId, socket.id, data.conversationId);
      }
      if (user.doctorId && user.doctorId !== userId) {
        presenceManager.heartbeat(user.doctorId, socket.id, data.conversationId);
      }
    }
  });

  // --- chat:send ---
  socket.on(
    'chat:send',
    async (
      data: {
        conversationId: string;
        message: string;
        messageType?: string;
        replyToMessageId?: string | null;
        reply_to_message_id?: string | null;
      },
      callback?: (res: { success: boolean; data?: any; error?: string }) => void,
    ) => {
      try {
        let conversationId = data?.conversationId;
        const { message, messageType = 'TEXT' } = data || {};
        const replyToMessageId =
          data?.replyToMessageId ||
          (data as any)?.reply_to_message_id ||
          null;

        if (!conversationId && ((data as any)?.doctorId || (data as any)?.targetDoctorId || (data as any)?.recipientId)) {
          const conv = await chatService.getOrCreateConversation(
            userId,
            userRole,
            (data as any).doctorId || (data as any).targetDoctorId,
            (data as any).patientId || (data as any).targetPatientId,
            (data as any).recipientId,
          );
          conversationId = conv.id;
        }

        if (!conversationId || !message?.trim()) {
          callback?.({
            success: false,
            error: 'conversationId and message are required',
          });
          return;
        }

        logger.info(
          { conversationId, userId, messageType, replyToMessageId },
          '[Chat] Message received',
        );

        const { conversation, senderType } =
          await chatService.authorizeConversation(
            conversationId,
            userId,
            userRole,
          );

        // Canonical sender_id strictly from socket.data.userId (authenticated user_accounts.id)
        const senderId = socket.data.userId || userId;
        const senderRole = socket.data.role || userRole || (senderType === 'PATIENT' ? 'patient' : 'doctor');

        // Save message to PostgreSQL (within transaction in repository)
        const savedMessage = await chatRepo.saveMessage(
          conversationId,
          senderId,
          senderType,
          message.trim(),
          messageType,
          undefined,
          replyToMessageId,
        );

        logger.info(
          { conversationId, messageId: savedMessage.id, senderType },
          '[Chat] Message saved',
        );

        const recipientUserId = await chatService.getRecipientUserId(conversation, senderType);

        logger.info(
          { conversationId, recipientUserId },
          '[Chat] Recipient resolved',
        );

        // Check if recipient is online for delivery status
        const isRecipientOnline = presenceManager.isUserOnline(recipientUserId);
        if (isRecipientOnline) {
          await chatRepo.markMessagesAsDelivered(conversationId, senderType, [
            savedMessage.id,
          ]);
          savedMessage.status = 'DELIVERED';
          savedMessage.delivered_at = new Date().toISOString();
        }

        // Canonical message object
        const canonicalMessage = {
          id: savedMessage.id,
          conversation_id: savedMessage.conversation_id,
          conversationId: savedMessage.conversation_id,
          doctor_id: conversation.doctor_id,
          doctorId: conversation.doctor_id,
          patient_id: conversation.patient_id,
          patientId: conversation.patient_id,
          sender_id: senderId,
          senderId: senderId,
          sender_role: senderRole,
          senderRole: senderRole,
          sender_type: savedMessage.sender_type,
          senderType: savedMessage.sender_type,
          recipient_id: recipientUserId,
          recipientId: recipientUserId,
          content: savedMessage.message,
          message: savedMessage.message,
          message_type: savedMessage.message_type,
          messageType: savedMessage.message_type,
          status: savedMessage.status,
          sent_at: savedMessage.sent_at,
          sentAt: savedMessage.sent_at,
          delivered_at: savedMessage.delivered_at,
          deliveredAt: savedMessage.delivered_at,
          read_at: savedMessage.read_at,
          readAt: savedMessage.read_at,
          created_at: savedMessage.created_at,
          createdAt: savedMessage.created_at,
          attachment_url: savedMessage.attachment_url || null,
          attachmentUrl: savedMessage.attachment_url || null,
          attachment_name: savedMessage.attachment_name || null,
          attachmentName: savedMessage.attachment_name || null,
          attachment_type: savedMessage.attachment_type || null,
          attachmentType: savedMessage.attachment_type || null,
          attachment_size: savedMessage.attachment_size ? Number(savedMessage.attachment_size) : null,
          attachmentSize: savedMessage.attachment_size ? Number(savedMessage.attachment_size) : null,
          storage_key: savedMessage.storage_key || null,
          storageKey: savedMessage.storage_key || null,
          reply_to_message_id: savedMessage.reply_to_message_id || null,
          replyToMessageId: savedMessage.reply_to_message_id || null,
          reply_to: savedMessage.reply_to || null,
          replyTo: savedMessage.reply_to || null,
        };

        const convRoom = getConversationRoom(conversationId);

        // Emit realtime message to conversation rooms and recipient room
        io.to(`conversation:${conversationId}`).emit('chat:message', canonicalMessage);
        io.to(convRoom).emit('chat:message', canonicalMessage);
        io.to(getUserRoom(recipientUserId)).emit('chat:message', canonicalMessage);

        // Check whether recipient is actively viewing this exact conversation
        const recipientClinicalId =
          senderType === 'DOCTOR' ? conversation.patient_id : conversation.doctor_id;

        const isRecipientViewingChat =
          presenceManager.isUserViewingConversation(recipientUserId, conversationId) ||
          (recipientClinicalId && recipientClinicalId !== recipientUserId
            ? presenceManager.isUserViewingConversation(recipientClinicalId, conversationId)
            : false);

        logger.info(
          { conversationId, recipientUserId, isRecipientViewingChat },
          `[Chat] Recipient presence checked: ${isRecipientViewingChat ? 'viewing chat' : 'not viewing chat'}`,
        );

        if (isRecipientViewingChat) {
          logger.info(
            { conversationId, recipientUserId, suppressionReason: 'live_presence_heartbeat' },
            '[Chat] Skipping FCM - recipient actively viewing conversation',
          );
        } else {
          logger.info(
            { conversationId, recipientUserId, suppressionReason: 'no_active_presence' },
            '[Chat] Recipient not viewing chat - dispatching FCM',
          );

          const isDoctorSender = senderType === 'DOCTOR';
          const notificationTitle = isDoctorSender
            ? 'New message from your doctor'
            : 'New message from your patient';
          const notificationBody = 'You have a new message.';
          const recipientAppType = isDoctorSender ? 'PATIENT' : 'DOCTOR';

          logger.info(
            { conversationId, recipientUserId, recipientAppType, title: notificationTitle },
            '[FCM] Chat notification sending',
          );

          // Dispatch FCM push notification to active device tokens
          void notificationService.sendToUser(
            recipientUserId,
            {
              type: 'CHAT_MESSAGE',
              title: notificationTitle,
              body: notificationBody,
              entityType: 'CONVERSATION',
              entityId: conversationId,
              route: 'Chat',
              data: {
                type: 'CHAT_MESSAGE',
                conversationId,
                messageId: savedMessage.id,
                senderId,
                senderType,
                recipientId: recipientUserId,
                screen: 'Chat',
                doctorId: conversation.doctor_id,
                patientId: conversation.patient_id,
              },
            },
            { saveInApp: false, appType: recipientAppType },
          ).then((sendRes) => {
            if (sendRes.sentCount > 0) {
              logger.info(
                { conversationId, recipientUserId, sentCount: sendRes.sentCount },
                '[FCM] Chat notification sent',
              );
            } else if (sendRes.failureCount === 0 && sendRes.sentCount === 0) {
              logger.info(
                { conversationId, recipientUserId },
                '[FCM] No active recipient tokens',
              );
            }
          }).catch((notifErr) => {
            logger.warn(
              { error: notifErr instanceof Error ? notifErr.message : String(notifErr), conversationId, recipientUserId },
              '[FCM] Failed to dispatch chat push notification',
            );
          });
        }

        // Acknowledge sending client
        callback?.({ success: true, data: canonicalMessage });
      } catch (err: any) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          '[Chat] Failed to send message',
        );
        callback?.({
          success: false,
          error: err?.message || 'Failed to send message',
        });
        socket.emit('chat:error', {
          code: 'SEND_ERROR',
          message: err?.message || 'Failed to send message',
        });
      }
    },
  );

  // --- chat:typing:start ---
  socket.on('chat:typing:start', (data: { conversationId: string }) => {
    const { conversationId } = data || {};
    if (conversationId) {
      const payload = {
        conversationId,
        conversation_id: conversationId,
        userId,
        senderId: userId,
        isTyping: true,
      };
      socket.to(getConversationRoom(conversationId)).emit('chat:typing', payload);
      socket.to(`conversation:${conversationId}`).emit('chat:typing', payload);
      socket.to(getConversationRoom(conversationId)).emit('chat:typing:start', payload);
      socket.to(`conversation:${conversationId}`).emit('chat:typing:start', payload);
    }
  });

  // --- chat:typing:stop ---
  socket.on('chat:typing:stop', (data: { conversationId: string }) => {
    const { conversationId } = data || {};
    if (conversationId) {
      const payload = {
        conversationId,
        conversation_id: conversationId,
        userId,
        senderId: userId,
        isTyping: false,
      };
      socket.to(getConversationRoom(conversationId)).emit('chat:typing', payload);
      socket.to(`conversation:${conversationId}`).emit('chat:typing', payload);
      socket.to(getConversationRoom(conversationId)).emit('chat:typing:stop', payload);
      socket.to(`conversation:${conversationId}`).emit('chat:typing:stop', payload);
    }
  });

  // --- chat:read ---
  socket.on(
    'chat:read',
    (data: { conversationId: string; messageIds?: string[] }) => {
      void (async () => {
        try {
          const { conversationId, messageIds } = data || {};
          if (conversationId) {
            const { conversation, senderType } = await chatService.authorizeConversation(
              conversationId,
              userId,
              userRole,
            );

            const readIds = await chatRepo.markMessagesAsRead(
              conversationId,
              senderType,
              messageIds,
            );

            if (readIds.length > 0) {
              const convRoom = getConversationRoom(conversationId);
              const readPayload = {
                conversationId,
                conversation_id: conversationId,
                messageIds: readIds,
                readAt: new Date().toISOString(),
              };
              io.to(convRoom).emit('chat:message:read', readPayload);
              io.to(`conversation:${conversationId}`).emit('chat:message:read', readPayload);
              io.to(convRoom).emit('chat:read', readPayload);
              io.to(`conversation:${conversationId}`).emit('chat:read', readPayload);

              const recipientUserId = await chatService.getRecipientUserId(conversation, senderType);
              if (recipientUserId) {
                io.to(getUserRoom(recipientUserId)).emit('chat:message:read', readPayload);
                io.to(getUserRoom(recipientUserId)).emit('chat:read', readPayload);
              }
            }
          }
        } catch {
          // Ignore read error
        }
      })();
    },
  );

  // --- chat:delivery ---
  socket.on(
    'chat:delivery',
    (data: { conversationId: string; messageIds?: string[] }) => {
      void (async () => {
        try {
          const { conversationId, messageIds } = data || {};
          if (conversationId) {
            const { conversation, senderType } = await chatService.authorizeConversation(
              conversationId,
              userId,
              userRole,
            );

            const deliveredIds = await chatRepo.markMessagesAsDelivered(
              conversationId,
              senderType,
              messageIds,
            );

            if (deliveredIds.length > 0) {
              const convRoom = getConversationRoom(conversationId);
              const deliveryPayload = {
                conversationId,
                conversation_id: conversationId,
                messageIds: deliveredIds,
                deliveredAt: new Date().toISOString(),
              };
              io.to(convRoom).emit('chat:message:delivered', deliveryPayload);
              io.to(`conversation:${conversationId}`).emit('chat:message:delivered', deliveryPayload);
              io.to(convRoom).emit('chat:delivery', deliveryPayload);
              io.to(`conversation:${conversationId}`).emit('chat:delivery', deliveryPayload);

              const recipientUserId = await chatService.getRecipientUserId(conversation, senderType);
              if (recipientUserId) {
                io.to(getUserRoom(recipientUserId)).emit('chat:message:delivered', deliveryPayload);
                io.to(getUserRoom(recipientUserId)).emit('chat:delivery', deliveryPayload);
              }
            }
          }
        } catch {
          // Ignore delivery error
        }
      })();
    },
  );

  // --- chat:delete / chat:message:delete ---
  const handleDelete = (
    data: { conversationId: string; messageId: string },
    callback?: (res: any) => void,
  ) => {
    void (async () => {
      try {
        const { conversationId, messageId } = data || {};
        if (!conversationId || !messageId) {
          callback?.({ success: false, error: 'conversationId and messageId are required' });
          return;
        }
        const deleted = await chatService.deleteMessage(
          conversationId,
          messageId,
          userId,
          userRole,
        );
        callback?.({ success: true, message: deleted });
      } catch (err: any) {
        callback?.({ success: false, error: err.message || 'Failed to delete message' });
      }
    })();
  };

  socket.on('chat:delete', handleDelete);
  socket.on('chat:message:delete', handleDelete);

  // --- disconnect ---
  socket.on('disconnect', () => {
    presenceManager.removeUserSocket(userId, socket.id);
    if (user.patientId && user.patientId !== userId) {
      presenceManager.removeUserSocket(user.patientId, socket.id);
    }
    if (user.doctorId && user.doctorId !== userId) {
      presenceManager.removeUserSocket(user.doctorId, socket.id);
    }
    logger.debug({ userId, socketId: socket.id }, '[Chat] Socket disconnected, presence cleared');
  });
}

