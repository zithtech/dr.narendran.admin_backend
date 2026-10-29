import { pool } from '@/db/pool.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/http/errors.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';
import { getIO } from '@/socket/index.js';
import { presenceManager } from '@/socket/presenceManager.js';
import { getConversationRoom, getUserRoom } from '@/socket/socketRooms.js';

import * as chatRepo from './chat.repository.js';
import type {
  ChatConversation,
  ChatDoctor,
  ChatMessage,
  SenderType,
} from './chat.types.js';

export interface ResolvedIdentity {
  patientId?: string;
  doctorId?: string;
  patientIds?: string[];
  doctorIds?: string[];
  userAccountId: string;
  senderType: SenderType;
  name: string;
}


async function signProfileImageUrl(rawUrl?: string | null): Promise<string | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  if (trimmed.includes('amazonaws.com')) {
    try {
      const parts = trimmed.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          return await s3Service.getReadUrl(decodeURIComponent(key), 86400);
        }
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export class ChatService {
  async resolveUserIdentity(
    userId: string,
    role?: string,
  ): Promise<ResolvedIdentity> {
    const normalizedRole = role?.toLowerCase() || '';
    const client = await pool.connect();
    try {
      // 1. Fetch user account details if available
      const { rows: uaRows } = await client.query(
        `SELECT id, username, role FROM user_accounts WHERE id = $1`,
        [userId],
      );
      const username = uaRows[0]?.username;
      const accountRole = uaRows[0]?.role?.toLowerCase() || '';

      const isDoctorRole = normalizedRole === 'doctor' || accountRole === 'doctor';

      if (isDoctorRole) {
        // Direct match in doctors table
        const { rows: docRows } = await client.query(
          `SELECT id, name, user_account_id, phone, email FROM doctors 
           WHERE (user_account_id::text = $1) OR (id::text = $1)
           LIMIT 1`,
          [userId],
        );

        if (docRows.length > 0) {
          const doc = docRows[0];
          const doctorIds = Array.from(new Set([doc.id, userId, doc.user_account_id].filter(Boolean) as string[]));
          return {
            doctorId: doc.id,
            doctorIds,
            userAccountId: doc.user_account_id || userId,
            senderType: 'DOCTOR',
            name: doc.name || 'Doctor',
          };
        }

        // Check doctor_profiles and users tables as fallback
        const { rows: dpRows } = await client.query(
          `SELECT * FROM doctor_profiles WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        const dp = dpRows[0];

        const { rows: uRows } = await client.query(
          `SELECT * FROM users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        const u = uRows[0];

        const contactPhone = dp?.contact_phone || u?.mobile_number || username;
        const contactEmail = dp?.contact_email || u?.email || username;
        const fullName = dp?.full_name || u?.full_name;

        // Try to match doctor by phone, email, or name
        const { rows: fallbackDocRows } = await client.query(
          `SELECT id, name, user_account_id, phone, email FROM doctors
           WHERE (phone IS NOT NULL AND $1::text IS NOT NULL AND phone = $1::text)
              OR (email IS NOT NULL AND $2::text IS NOT NULL AND lower(email) = lower($2::text))
              OR ($3::text IS NOT NULL AND (name ILIKE $3::text OR name ILIKE REPLACE($3::text, 'Dr. ', '') OR ('Dr. ' || name) ILIKE $3::text))
           LIMIT 1`,
          [contactPhone || null, contactEmail || null, fullName || null],
        );

        if (fallbackDocRows.length > 0) {
          const doc = fallbackDocRows[0];
          if (!doc.user_account_id) {
            try {
              await client.query(
                `UPDATE doctors SET user_account_id = $1, updated_at = NOW() WHERE id = $2`,
                [userId, doc.id],
              );
              doc.user_account_id = userId;
            } catch {
              // Ignore update conflict if any
            }
          }
          const doctorIds = Array.from(new Set([doc.id, userId, doc.user_account_id].filter(Boolean) as string[]));
          return {
            doctorId: doc.id,
            doctorIds,
            userAccountId: userId,
            senderType: 'DOCTOR',
            name: doc.name || fullName || 'Doctor',
          };
        }

        return {
          doctorId: userId,
          doctorIds: [userId],
          userAccountId: userId,
          senderType: 'DOCTOR',
          name: fullName || 'Doctor',
        };
      }

      // Check if user exists in patients table
      const { rows: patientRows } = await client.query(
        `SELECT id, name, user_account_id, phone, email FROM patients 
         WHERE (user_account_id::text = $1) OR (user_id::text = $1) OR (id::text = $1)
         LIMIT 1`,
        [userId],
      );

      if (patientRows.length > 0) {
        const p = patientRows[0];
        const patientIds = Array.from(new Set([p.id, userId, p.user_account_id].filter(Boolean) as string[]));
        return {
          patientId: p.id,
          patientIds,
          userAccountId: p.user_account_id || userId,
          senderType: 'PATIENT',
          name: p.name || 'Patient',
        };
      }

      // Check patient_profiles fallback
      const { rows: ppRows } = await client.query(
        `SELECT * FROM patient_profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      const pp = ppRows[0];

      const { rows: uRows } = await client.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const u = uRows[0];

      const pPhone = u?.mobile_number || username;
      const pEmail = u?.email || username;
      const pName = pp?.full_name || u?.full_name;

      const { rows: fallbackPatientRows } = await client.query(
        `SELECT id, name, user_account_id, phone, email FROM patients
         WHERE (phone IS NOT NULL AND $1::text IS NOT NULL AND phone = $1::text)
            OR (email IS NOT NULL AND $2::text IS NOT NULL AND lower(email) = lower($2::text))
            OR ($3::text IS NOT NULL AND name ILIKE $3::text)
         LIMIT 1`,
        [pPhone || null, pEmail || null, pName || null],
      );


      if (fallbackPatientRows.length > 0) {
        const p = fallbackPatientRows[0];
        if (!p.user_account_id) {
          try {
            await client.query(
              `UPDATE patients SET user_account_id = $1, updated_at = NOW() WHERE id = $2`,
              [userId, p.id],
            );
            p.user_account_id = userId;
          } catch {
            // Ignore update conflict if any
          }
        }
        const patientIds = Array.from(new Set([p.id, userId, p.user_account_id].filter(Boolean) as string[]));
        return {
          patientId: p.id,
          patientIds,
          userAccountId: userId,
          senderType: 'PATIENT',
          name: p.name || pName || 'Patient',
        };
      }

      // If not in patients table, check if user exists in doctors table
      const { rows: docRows } = await client.query(
        `SELECT id, name, user_account_id FROM doctors 
         WHERE (user_account_id::text = $1) OR (id::text = $1)
         LIMIT 1`,
        [userId],
      );
      if (docRows.length > 0) {
        const doc = docRows[0];
        const doctorIds = Array.from(new Set([doc.id, userId, doc.user_account_id].filter(Boolean) as string[]));
        return {
          doctorId: doc.id,
          doctorIds,
          userAccountId: doc.user_account_id || userId,
          senderType: 'DOCTOR',
          name: doc.name || 'Doctor',
        };
      }

      return {
        patientId: userId,
        patientIds: [userId],
        userAccountId: userId,
        senderType: 'PATIENT',
        name: 'Patient',
      };
    } finally {
      client.release();
    }
  }

  async getRecipientUserId(
    conversation: ChatConversation,
    senderType: SenderType,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      if (senderType === 'PATIENT') {
        // Recipient is doctor
        const { rows } = await client.query(
          `SELECT user_account_id, id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [conversation.doctor_id],
        );
        return rows[0]?.user_account_id || rows[0]?.id || conversation.doctor_id;
      } else {
        // Recipient is patient
        const { rows } = await client.query(
          `SELECT user_account_id, id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [conversation.patient_id],
        );
        return rows[0]?.user_account_id || rows[0]?.id || conversation.patient_id;
      }
    } finally {
      client.release();
    }
  }

  async getDoctors(
    speciality?: string,
    search?: string,
    currentPatientId?: string,
  ): Promise<ChatDoctor[]> {
    const client = await pool.connect();
    try {
      let query = `
        SELECT d.id,
               d.name,
               d.specialization,
               d.phone,
               d.email,
               d.user_account_id,
               COALESCE(d.profile_image_url, dp.profile_image_url, '') as profile_image_url
        FROM doctors d
        LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id)
        WHERE (d.status IS NULL OR d.status = 'ACTIVE')
      `;
      const params: any[] = [];

      if (speciality && speciality.toLowerCase() !== 'all') {
        params.push(`%${speciality}%`);
        query += ` AND d.specialization ILIKE $${params.length}`;
      }

      if (search && search.trim().length > 0) {
        params.push(`%${search.trim()}%`);
        query += ` AND (d.name ILIKE $${params.length} OR d.specialization ILIKE $${params.length})`;
      }

      query += ` ORDER BY d.name ASC`;

      const { rows } = await client.query(query, params);

      const doctors: ChatDoctor[] = [];
      for (const row of rows) {
        const isOnline =
          presenceManager.isUserOnline(row.id) ||
          (row.user_account_id ? presenceManager.isUserOnline(row.user_account_id) : false);

        let lastMessage: string | undefined = undefined;
        let lastMessageAt: string | undefined = undefined;
        let unreadCount: number | undefined = undefined;

        if (currentPatientId) {
          const conv = await chatRepo.findConversationByPatientDoctor(
            currentPatientId,
            row.id,
          );
          if (conv) {
            lastMessage = conv.last_message || undefined;
            lastMessageAt = conv.last_message_at || conv.updated_at || undefined;
            unreadCount = conv.unread_count || 0;
          }
        }

        const rawName = row.name || 'Doctor';
        const formattedName = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
        const signedImage = await signProfileImageUrl(row.profile_image_url);

        doctors.push({
          id: row.id,
          user_account_id: row.user_account_id,
          userAccountId: row.user_account_id,
          name: formattedName,
          specialization: row.specialization || 'General Medicine',
          specialty: row.specialization || 'General Medicine',
          profile_image_url: signedImage || undefined,
          avatar_url: signedImage || undefined,
          is_online: isOnline,
          online_status: isOnline ? 'online' : 'offline',
          last_message: lastMessage,
          last_message_at: lastMessageAt,
          unread_count: unreadCount,
        });
      }

      return doctors;
    } finally {
      client.release();
    }
  }

  async getOrCreateConversation(
    userId: string,
    role: string,
    targetDoctorId?: string,
    targetPatientId?: string,
    recipientId?: string,
  ): Promise<ChatConversation> {
    const identity = await this.resolveUserIdentity(userId, role);
    const client = await pool.connect();

    try {
      let patientId: string | undefined;
      let doctorId: string | undefined;

      if (targetPatientId && targetDoctorId) {
        patientId = targetPatientId;
        doctorId = targetDoctorId;
      } else if (targetPatientId && !targetDoctorId) {
        patientId = targetPatientId;
        doctorId = identity.doctorId || userId;
      } else if (targetDoctorId && !targetPatientId) {
        doctorId = targetDoctorId;
        patientId = identity.patientId || userId;
      } else if (recipientId) {
        if (identity.senderType === 'DOCTOR') {
          patientId = recipientId;
          doctorId = identity.doctorId || userId;
        } else {
          doctorId = recipientId;
          patientId = identity.patientId || userId;
        }
      } else if (identity.senderType === 'PATIENT') {
        if (!targetDoctorId) {
          throw new ValidationError('doctor_id or patient_id is required');
        }
        doctorId = targetDoctorId;
        patientId = identity.patientId || userId;
      } else {
        if (!targetPatientId) {
          throw new ValidationError('patient_id or doctor_id is required');
        }
        patientId = targetPatientId;
        doctorId = identity.doctorId || userId;
      }

      // Resolve doctorId to doctors.id if user_account_id was passed
      if (doctorId) {
        const { rows: dRows } = await client.query(
          `SELECT id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [doctorId],
        );
        if (dRows.length > 0) {
          doctorId = dRows[0].id;
        }
      }

      // Resolve patientId to patients.id if user_account_id was passed
      if (patientId) {
        const { rows: pRows } = await client.query(
          `SELECT id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [patientId],
        );
        if (pRows.length > 0) {
          patientId = pRows[0].id;
        }
      }

      if (!patientId || !doctorId) {
        throw new ValidationError('Unable to identify patient and doctor');
      }

      let conv = await chatRepo.findConversationByPatientDoctor(patientId, doctorId);
      if (!conv) {
        conv = await chatRepo.createConversation(patientId, doctorId);
      }

      return {
        ...conv,
        id: conv.id,
        conversation_id: conv.id,
      };
    } finally {
      client.release();
    }
  }

  async getConversations(
    userId: string,
    role: string,
  ): Promise<ChatConversation[]> {
    const identity = await this.resolveUserIdentity(userId, role);

    if (identity.senderType === 'DOCTOR') {
      const doctorIds = identity.doctorIds || [identity.doctorId || userId, userId];
      const convs = await chatRepo.getConversationsForDoctor(doctorIds);

      // Development logging
      // eslint-disable-next-line no-console
      console.log('Authenticated doctor user ID:', userId);
      // eslint-disable-next-line no-console
      console.log('Resolved doctor ID:', identity.doctorId);
      // eslint-disable-next-line no-console
      console.log('Conversation query doctor ID:', doctorIds);
      // eslint-disable-next-line no-console
      console.log('Number of conversations returned:', convs.length);

      logger.info(
        {
          authenticatedDoctorUserId: userId,
          resolvedDoctorId: identity.doctorId,
          conversationQueryDoctorId: doctorIds,
          numberOfConversationsReturned: convs.length,
        },
        `Authenticated doctor user ID: ${userId} | Resolved doctor ID: ${identity.doctorId} | Conversation query doctor ID: ${JSON.stringify(doctorIds)} | Number of conversations returned: ${convs.length}`,
      );


      return convs.map(c => ({
        ...c,
        id: c.id,
        conversation_id: c.conversation_id || c.id,
        conversationId: c.conversation_id || c.id,
        patient_id: c.patient_id,
        patientId: c.patient_id,
        doctor_id: c.doctor_id,
        doctorId: c.doctor_id,
        patient_name: c.patient_name || 'Patient',
        patientName: c.patient_name || 'Patient',
        patient_phone: c.patient_phone || '',
        patientPhone: c.patient_phone || '',
        patient_profile_image: c.patient_profile_image || c.patient_avatar || '',
        patient_avatar: c.patient_avatar || c.patient_profile_image || '',
        profile_image_url: c.profile_image_url || c.patient_profile_image || '',
        last_message: c.last_message || null,
        lastMessage: c.last_message || null,
        last_message_at: c.last_message_at || c.updated_at || null,
        lastMessageAt: c.last_message_at || c.updated_at || null,
        unread_count: Number(c.unread_count || 0),
        unreadCount: Number(c.unread_count || 0),
        patient_online: presenceManager.isUserOnline(c.patient_id),
      }));
    } else {
      const patientIds = identity.patientIds || [identity.patientId || userId, userId];
      const convs = await chatRepo.getConversationsForPatient(patientIds);

      return Promise.all(convs.map(async c => {
        const rawDoctorImg = c.profile_image_url || c.doctor_profile_image || c.doctor_avatar || null;
        const signedDoctorImg = await signProfileImageUrl(rawDoctorImg);
        return {
        ...c,
        id: c.id,
        conversation_id: c.conversation_id || c.id,
        conversationId: c.conversation_id || c.id,
        patient_id: c.patient_id,
        patientId: c.patient_id,
        doctor_id: c.doctor_id,
        doctorId: c.doctor_id,
        doctor_name: c.doctor_name || 'Doctor',
        doctorName: c.doctor_name || 'Doctor',
        specialization: c.specialization || 'General Medicine',
        doctor_avatar: signedDoctorImg || '',
        doctor_profile_image: signedDoctorImg || '',
        profile_image_url: signedDoctorImg || '',
        last_message: c.last_message || null,
        lastMessage: c.last_message || null,
        last_message_at: c.last_message_at || c.updated_at || null,
        lastMessageAt: c.last_message_at || c.updated_at || null,
        unread_count: Number(c.unread_count || 0),
        unreadCount: Number(c.unread_count || 0),
        doctor_online: presenceManager.isUserOnline(c.doctor_id),
      }}));
    }
  }

  async authorizeConversation(
    conversationId: string,
    userId: string,
    role: string,
  ): Promise<{ conversation: ChatConversation; senderType: SenderType }> {
    const conv = await chatRepo.findConversationById(conversationId);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }

    const identity = await this.resolveUserIdentity(userId, role);
    const patientIds = identity.patientIds || [identity.patientId || userId, userId, identity.userAccountId];
    const doctorIds = identity.doctorIds || [identity.doctorId || userId, userId, identity.userAccountId];

    const isPatientMatch = patientIds.some(id => id && (conv.patient_id === id || String(conv.patient_id) === String(id)));
    const isDoctorMatch = doctorIds.some(id => id && (conv.doctor_id === id || String(conv.doctor_id) === String(id)));

    if (identity.senderType === 'PATIENT' && isPatientMatch) {
      return { conversation: conv, senderType: 'PATIENT' };
    }
    if (identity.senderType === 'DOCTOR' && isDoctorMatch) {
      return { conversation: conv, senderType: 'DOCTOR' };
    }
    if (isPatientMatch) {
      return { conversation: conv, senderType: 'PATIENT' };
    }
    if (isDoctorMatch) {
      return { conversation: conv, senderType: 'DOCTOR' };
    }

    throw new ForbiddenError('You are not a participant in this conversation');
  }

  async getMessages(
    conversationId: string,
    userId: string,
    role: string,
    limit = 30,
    beforeId?: string,
  ): Promise<ChatMessage[]> {
    await this.authorizeConversation(conversationId, userId, role);
    const messages = await chatRepo.getMessagesByConversation(conversationId, limit, beforeId);

    // Dynamically sign attachment URLs if storage_key is present
    return Promise.all(
      messages.map(async msg => {
        let attachmentUrl = msg.attachment_url || null;
        if (msg.storage_key) {
          try {
            attachmentUrl = await s3Service.getReadUrl(decodeURIComponent(msg.storage_key), 86400);
          } catch (err) {
            logger.warn({ err, messageId: msg.id }, '[Chat] Failed to sign attachment URL');
          }
        }
        return {
          ...msg,
          attachment_url: attachmentUrl,
          attachmentUrl,
          attachment_name: msg.attachment_name || null,
          attachmentName: msg.attachment_name || null,
          attachment_type: msg.attachment_type || null,
          attachmentType: msg.attachment_type || null,
          attachment_size: msg.attachment_size ? Number(msg.attachment_size) : null,
          attachmentSize: msg.attachment_size ? Number(msg.attachment_size) : null,
          storage_key: msg.storage_key || null,
          storageKey: msg.storage_key || null,
          reply_to_message_id: msg.reply_to_message_id || null,
          replyToMessageId: msg.reply_to_message_id || null,
          reply_to: msg.reply_to || null,
          replyTo: msg.reply_to || null,
          messageType: msg.message_type,
          createdAt: msg.created_at,
          sentAt: msg.sent_at,
        };
      }),
    );
  }

  async searchMessages(
    conversationId: string,
    userId: string,
    role: string,
    query: string,
    limit = 30,
    offset = 0,
  ): Promise<ChatMessage[]> {
    if (!query || !query.trim()) {
      return [];
    }

    await this.authorizeConversation(conversationId, userId, role);
    const messages = await chatRepo.searchMessagesInConversation(
      conversationId,
      query.trim(),
      limit,
      offset,
    );

    // Dynamically sign attachment URLs if storage_key is present
    return Promise.all(
      messages.map(async msg => {
        let attachmentUrl = msg.attachment_url || null;
        if (msg.storage_key) {
          try {
            attachmentUrl = await s3Service.getReadUrl(decodeURIComponent(msg.storage_key), 86400);
          } catch (err) {
            logger.warn({ err, messageId: msg.id }, '[Chat] Failed to sign attachment URL in search');
          }
        }
        return {
          ...msg,
          attachment_url: attachmentUrl,
          attachmentUrl,
          attachment_name: msg.attachment_name || null,
          attachmentName: msg.attachment_name || null,
          attachment_type: msg.attachment_type || null,
          attachmentType: msg.attachment_type || null,
          attachment_size: msg.attachment_size ? Number(msg.attachment_size) : null,
          attachmentSize: msg.attachment_size ? Number(msg.attachment_size) : null,
          storage_key: msg.storage_key || null,
          storageKey: msg.storage_key || null,
          reply_to_message_id: msg.reply_to_message_id || null,
          replyToMessageId: msg.reply_to_message_id || null,
          reply_to: msg.reply_to || null,
          replyTo: msg.reply_to || null,
          messageType: msg.message_type,
          createdAt: msg.created_at,
          sentAt: msg.sent_at,
        };
      }),
    );
  }

  async uploadAttachment(
    conversationId: string,
    userId: string,
    role: string,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
    caption?: string,
    replyToMessageId?: string | null,
  ): Promise<ChatMessage> {
    const { conversation, senderType } = await this.authorizeConversation(
      conversationId,
      userId,
      role,
    );

    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/jpg',
      'application/pdf',
    ];

    const normalizedMime = (file.mimeType || '').toLowerCase();
    const isAllowed =
      allowedMimes.includes(normalizedMime) ||
      normalizedMime.startsWith('image/') ||
      file.fileName.toLowerCase().endsWith('.pdf');

    if (!isAllowed) {
      throw new ValidationError(
        'Invalid file type. Only JPG, PNG, WEBP, and PDF files are allowed.',
      );
    }

    const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
    if (file.fileSize > MAX_SIZE) {
      throw new ValidationError('File size exceeds the 15 MB limit.');
    }

    const safeFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `chat/${conversationId}/${Date.now()}_${safeFileName}`;
    const contentType =
      normalizedMime.includes('pdf') || file.fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : normalizedMime || 'image/jpeg';

    await s3Service.uploadBuffer(storageKey, file.buffer, contentType);
    const signedUrl = await s3Service.getReadUrl(storageKey, 86400);

    const messageType = contentType === 'application/pdf' ? 'PDF' : 'IMAGE';
    const messageText = caption && caption.trim().length > 0 ? caption.trim() : file.fileName;

    const savedMessage = await chatRepo.saveMessage(
      conversationId,
      userId,
      senderType,
      messageText,
      messageType,
      {
        attachmentUrl: signedUrl,
        attachmentName: file.fileName,
        attachmentType: contentType,
        attachmentSize: file.fileSize,
        storageKey,
      },
      ...(replyToMessageId ? [replyToMessageId] : []),
    );

    const recipientUserId = await this.getRecipientUserId(conversation, senderType);

    // Check if recipient is online
    const isRecipientOnline = presenceManager.isUserOnline(recipientUserId);
    if (isRecipientOnline) {
      await chatRepo.markMessagesAsDelivered(conversationId, senderType, [
        savedMessage.id,
      ]);
      savedMessage.status = 'DELIVERED';
      savedMessage.delivered_at = new Date().toISOString();
    }

    const canonicalMessage = {
      id: savedMessage.id,
      conversation_id: savedMessage.conversation_id,
      conversationId: savedMessage.conversation_id,
      doctor_id: conversation.doctor_id,
      doctorId: conversation.doctor_id,
      patient_id: conversation.patient_id,
      patientId: conversation.patient_id,
      sender_id: userId,
      senderId: userId,
      sender_role: role || (senderType === 'PATIENT' ? 'patient' : 'doctor'),
      senderRole: role || (senderType === 'PATIENT' ? 'patient' : 'doctor'),
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
      attachment_url: signedUrl,
      attachmentUrl: signedUrl,
      attachment_name: file.fileName,
      attachmentName: file.fileName,
      attachment_type: contentType,
      attachmentType: contentType,
      attachment_size: file.fileSize,
      attachmentSize: file.fileSize,
      storage_key: storageKey,
      storageKey: storageKey,
      reply_to_message_id: savedMessage.reply_to_message_id || null,
      replyToMessageId: savedMessage.reply_to_message_id || null,
      reply_to: savedMessage.reply_to || null,
      replyTo: savedMessage.reply_to || null,
    };

    // Broadcast over Socket.IO if initialized
    try {
      const io = getIO();
      const convRoom = getConversationRoom(conversationId);
      io.to(`conversation:${conversationId}`).emit('chat:message', canonicalMessage);
      io.to(convRoom).emit('chat:message', canonicalMessage);
      io.to(getUserRoom(recipientUserId)).emit('chat:message', canonicalMessage);
    } catch {
      // Socket might not be active in test environments
    }

    // Push notification if recipient is not actively viewing chat
    const recipientDomainId =
      senderType === 'DOCTOR' ? conversation.patient_id : conversation.doctor_id;
    const isRecipientViewingChat =
      presenceManager.isUserViewingConversation(recipientUserId, conversationId) ||
      (recipientDomainId ? presenceManager.isUserViewingConversation(recipientDomainId, conversationId) : false);

    if (!isRecipientViewingChat) {
      const isDoctorSender = senderType === 'DOCTOR';
      const notificationTitle = isDoctorSender
        ? 'New message from your doctor'
        : 'New message from your patient';
      const notificationBody =
        messageType === 'IMAGE'
          ? 'Sent an image.'
          : `Sent a PDF document: ${file.fileName}`;

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
            senderId: userId,
            senderType,
            recipientId: recipientUserId,
            screen: 'Chat',
            doctorId: conversation.doctor_id,
            patientId: conversation.patient_id,
          },
        },
      );
    }

    return {
      ...savedMessage,
      attachment_url: signedUrl,
      attachmentUrl: signedUrl,
      attachment_name: file.fileName,
      attachmentName: file.fileName,
      attachment_type: contentType,
      attachmentType: contentType,
      attachment_size: file.fileSize,
      attachmentSize: file.fileSize,
      storage_key: storageKey,
      storageKey: storageKey,
    };
  }

  async getAttachmentSignedUrl(
    conversationId: string,
    messageId: string,
    userId: string,
    role: string,
  ): Promise<{ downloadUrl: string; fileName: string; mimeType: string }> {
    await this.authorizeConversation(conversationId, userId, role);

    const message = await chatRepo.findMessageById(messageId);
    if (message?.conversation_id !== conversationId) {
      throw new NotFoundError('Attachment not found');
    }

    if (!message.storage_key) {
      throw new NotFoundError('No attachment associated with this message');
    }

    const downloadUrl = await s3Service.getReadUrl(decodeURIComponent(message.storage_key), 86400);

    return {
      downloadUrl,
      fileName: message.attachment_name || 'attachment',
      mimeType: message.attachment_type || 'application/octet-stream',
    };
  }

  async markAsRead(
    conversationId: string,
    userId: string,
    role: string,
    messageIds?: string[],
  ): Promise<string[]> {
    const { senderType } = await this.authorizeConversation(
      conversationId,
      userId,
      role,
    );
    return chatRepo.markMessagesAsRead(conversationId, senderType, messageIds);
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    role: string,
  ): Promise<ChatMessage> {
    const { conversation, senderType } = await this.authorizeConversation(
      conversationId,
      userId,
      role,
    );

    const message = await chatRepo.findMessageById(messageId);
    if (!message || message.conversation_id !== conversationId) {
      throw new NotFoundError('Message not found');
    }

    const identity = await this.resolveUserIdentity(userId, role);
    const userIds = senderType === 'PATIENT'
      ? (identity.patientIds || [identity.patientId || userId])
      : (identity.doctorIds || [identity.doctorId || userId]);

    const isAuthor = userIds.includes(message.sender_id) || message.sender_id === userId;
    const isDoctorInConversation = senderType === 'DOCTOR';

    if (!isAuthor && !isDoctorInConversation) {
      throw new ForbiddenError('You are not authorized to delete this message');
    }

    const deleted = await chatRepo.deleteMessage(messageId, conversationId);
    if (!deleted) {
      throw new NotFoundError('Message not found or already deleted');
    }

    // Broadcast deletion over Socket.IO if active
    try {
      const io = getIO();
      const payload = {
        conversationId,
        conversation_id: conversationId,
        messageId,
        message_id: messageId,
        message: deleted,
      };
      const convRoom = getConversationRoom(conversationId);
      io.to(`conversation:${conversationId}`).emit('chat:message:deleted', payload);
      io.to(convRoom).emit('chat:message:deleted', payload);
      io.to(`conversation:${conversationId}`).emit('chat:deleted', payload);
      io.to(convRoom).emit('chat:deleted', payload);

      const recipientUserId = await this.getRecipientUserId(conversation, senderType);
      if (recipientUserId) {
        io.to(getUserRoom(recipientUserId)).emit('chat:message:deleted', payload);
        io.to(getUserRoom(recipientUserId)).emit('chat:deleted', payload);
      }
    } catch {
      // Socket may not be initialized in test environments
    }

    return deleted;
  }
}

export const chatService = new ChatService();

