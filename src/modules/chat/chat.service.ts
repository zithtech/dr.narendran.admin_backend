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
  CategorizedRecipients,
  ChatConversation,
  ChatDoctor,
  ChatMessage,
  ChatRecipient,
  RecipientCategory,
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

      const isAdminRole =
        normalizedRole === 'admin' ||
        normalizedRole.includes('admin') ||
        normalizedRole.includes('super') ||
        accountRole === 'admin' ||
        accountRole.includes('admin') ||
        accountRole.includes('super');

      if (isAdminRole) {
        const { rows: auRows } = await client.query(
          `SELECT id, username as name, role FROM admin_users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        if (auRows.length > 0) {
          return {
            userAccountId: userId,
            senderType: 'PATIENT',
            name: auRows[0].name || 'Admin',
            doctorIds: [userId],
            patientIds: [userId],
          };
        }

        const { rows: mauRows } = await client.query(
          `SELECT id, name, role FROM master_admin_users WHERE id = $1 LIMIT 1`,
          [userId],
        );
        if (mauRows.length > 0) {
          return {
            userAccountId: userId,
            senderType: 'PATIENT',
            name: mauRows[0].name || 'Master Admin',
            doctorIds: [userId],
            patientIds: [userId],
          };
        }

        return {
          userAccountId: userId,
          senderType: 'PATIENT',
          name: username || 'Admin',
          doctorIds: [userId],
          patientIds: [userId],
        };
      }

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
      const targetEntityId =
        senderType === 'PATIENT' ? conversation.doctor_id : conversation.patient_id;

      // 1. Check doctors
      const { rows: dRows } = await client.query(
        `SELECT user_account_id, id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
        [targetEntityId],
      );
      if (dRows.length > 0) {
        return dRows[0].user_account_id || dRows[0].id || targetEntityId;
      }

      // 2. Check patients
      const { rows: pRows } = await client.query(
        `SELECT user_account_id, user_id, id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 OR (user_id IS NOT NULL AND user_id::text = $1) LIMIT 1`,
        [targetEntityId],
      );
      if (pRows.length > 0) {
        return pRows[0].user_account_id || pRows[0].user_id || pRows[0].id || targetEntityId;
      }

      // 3. Check admin_users
      const { rows: auRows } = await client.query(
        `SELECT id FROM admin_users WHERE id::text = $1 LIMIT 1`,
        [targetEntityId],
      );
      if (auRows.length > 0) {
        return auRows[0].id;
      }

      // 4. Check master_admin_users
      const { rows: mauRows } = await client.query(
        `SELECT id FROM master_admin_users WHERE id::text = $1 LIMIT 1`,
        [targetEntityId],
      );
      if (mauRows.length > 0) {
        return mauRows[0].id;
      }

      return targetEntityId;
    } finally {
      client.release();
    }
  }

  async getDoctors(
    speciality?: string,
    search?: string,
    callerId?: string,
    callerRole?: string,
  ): Promise<ChatRecipient[]> {
    let excludeUserIds: string[] = [];
    if (callerId) {
      excludeUserIds.push(callerId);
      try {
        const callerIdentity = await this.resolveUserIdentity(callerId, callerRole);
        if (callerIdentity.doctorId) excludeUserIds.push(callerIdentity.doctorId);
        if (callerIdentity.userAccountId) excludeUserIds.push(callerIdentity.userAccountId);
        if (callerIdentity.doctorIds) excludeUserIds.push(...callerIdentity.doctorIds);
      } catch {}
    }
    excludeUserIds = Array.from(new Set(excludeUserIds.filter(Boolean)));

    const rows = await chatRepo.getChatDoctors(excludeUserIds, search, speciality);
    const callerIds = callerId ? [callerId, ...(excludeUserIds || [])] : [];

    const doctors: ChatRecipient[] = [];
    for (const row of rows) {
      const isOnline =
        presenceManager.isUserOnline(row.id) ||
        (row.user_account_id ? presenceManager.isUserOnline(row.user_account_id) : false);

      let lastMessage: string | undefined = undefined;
      let lastMessageAt: string | undefined = undefined;
      let unreadCount: number | undefined = undefined;

      if (callerIds.length > 0) {
        const stats = await chatRepo.getLastMessageAndUnread(callerIds, row.id);
        lastMessage = stats?.lastMessage;
        lastMessageAt = stats?.lastMessageAt;
        unreadCount = stats?.unreadCount;
      }

      const rawName = row.name || 'Doctor';
      const formattedName = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
      const signedImage = await signProfileImageUrl(row.profile_image_url);

      doctors.push({
        id: row.id,
        user_account_id: row.user_account_id || undefined,
        name: formattedName,
        role: 'DOCTOR',
        specialization: row.specialization || 'General Medicine',
        specialty: row.specialization || 'General Medicine',
        subtitle: row.specialization || 'General Medicine',
        phone: row.phone || undefined,
        email: row.email || undefined,
        profile_image_url: signedImage || undefined,
        avatar_url: signedImage || undefined,
        is_online: isOnline,
        online_status: isOnline ? 'online' : 'offline',
        last_message: lastMessage,
        last_message_at: lastMessageAt,
        unread_count: unreadCount,
        status: row.status || 'ACTIVE',
      });
    }
    return doctors;
  }

  async getPatients(
    search?: string,
    callerId?: string,
    callerRole?: string,
  ): Promise<ChatRecipient[]> {
    const normRole = (callerRole || '').toLowerCase();
    if (normRole === 'patient') {
      throw new ForbiddenError('Patients are not authorized to view the patient recipient list');
    }
    if (normRole === 'doctor') {
      throw new ForbiddenError('Doctors are not authorized to view the patient recipient list');
    }

    let excludeUserIds: string[] = callerId ? [callerId] : [];
    if (callerId) {
      try {
        const callerIdentity = await this.resolveUserIdentity(callerId, callerRole);
        if (callerIdentity.patientId) excludeUserIds.push(callerIdentity.patientId);
        if (callerIdentity.userAccountId) excludeUserIds.push(callerIdentity.userAccountId);
      } catch {}
    }
    excludeUserIds = Array.from(new Set(excludeUserIds.filter(Boolean)));

    const rows = await chatRepo.getChatPatients(excludeUserIds, search);
    const callerIds = callerId ? [callerId, ...(excludeUserIds || [])] : [];

    const patients: ChatRecipient[] = [];
    for (const row of rows) {
      const isOnline =
        presenceManager.isUserOnline(row.id) ||
        (row.user_account_id ? presenceManager.isUserOnline(row.user_account_id) : false) ||
        (row.user_id ? presenceManager.isUserOnline(row.user_id) : false);

      let lastMessage: string | undefined = undefined;
      let lastMessageAt: string | undefined = undefined;
      let unreadCount: number | undefined = undefined;

      if (callerIds.length > 0) {
        const stats = await chatRepo.getLastMessageAndUnread(callerIds, row.id);
        lastMessage = stats?.lastMessage;
        lastMessageAt = stats?.lastMessageAt;
        unreadCount = stats?.unreadCount;
      }

      const signedImage = await signProfileImageUrl(row.profile_image_url);
      const subtitle =
        [row.age ? `${row.age} yrs` : null, row.gender].filter(Boolean).join(' • ') ||
        row.phone ||
        row.mrn ||
        'Patient';

      patients.push({
        id: row.id,
        user_account_id: row.user_account_id || row.user_id || undefined,
        name: row.name || 'Patient',
        role: 'PATIENT',
        subtitle,
        phone: row.phone || undefined,
        email: row.email || undefined,
        gender: row.gender || undefined,
        age: row.age || undefined,
        profile_image_url: signedImage || undefined,
        avatar_url: signedImage || undefined,
        is_online: isOnline,
        online_status: isOnline ? 'online' : 'offline',
        last_message: lastMessage,
        last_message_at: lastMessageAt,
        unread_count: unreadCount,
        status: row.status || 'ACTIVE',
      });
    }
    return patients;
  }

  async getOtherUsers(
    search?: string,
    callerId?: string,
    _callerRole?: string,
  ): Promise<ChatRecipient[]> {
    const excludeUserIds: string[] = callerId ? [callerId] : [];
    const rows = await chatRepo.getChatOtherUsers(excludeUserIds, search);
    const callerIds = callerId ? [callerId] : [];

    const others: ChatRecipient[] = [];
    for (const row of rows) {
      const isOnline = presenceManager.isUserOnline(row.id);

      let lastMessage: string | undefined = undefined;
      let lastMessageAt: string | undefined = undefined;
      let unreadCount: number | undefined = undefined;

      if (callerIds.length > 0) {
        const stats = await chatRepo.getLastMessageAndUnread(callerIds, row.id);
        lastMessage = stats?.lastMessage;
        lastMessageAt = stats?.lastMessageAt;
        unreadCount = stats?.unreadCount;
      }

      const rawRole = (row.role || 'Admin').toUpperCase();
      others.push({
        id: row.id,
        user_account_id: row.id,
        name: row.name || 'Admin',
        role: rawRole,
        subtitle: `${row.role || 'Admin'} Account`,
        phone: row.phone || undefined,
        email: row.email || undefined,
        is_online: isOnline,
        online_status: isOnline ? 'online' : 'offline',
        last_message: lastMessage,
        last_message_at: lastMessageAt,
        unread_count: unreadCount,
        status: row.status || 'ACTIVE',
      });
    }
    return others;
  }

  async getRecipients(
    callerId: string,
    callerRole: string,
    category?: string,
    search?: string,
    speciality?: string,
  ): Promise<CategorizedRecipients | ChatRecipient[]> {
    const normCategory = category?.toLowerCase()?.trim();

    if (normCategory) {
      if (normCategory === 'doctors') {
        return this.getDoctors(speciality, search, callerId, callerRole);
      }
      if (normCategory === 'patients') {
        return this.getPatients(search, callerId, callerRole);
      }
      if (normCategory === 'others' || normCategory === 'admins') {
        return this.getOtherUsers(search, callerId, callerRole);
      }
      throw new ValidationError('Invalid category. Must be doctors, patients, or others.');
    }

    const normRole = (callerRole || '').toLowerCase();
    const isAdmin = normRole === 'admin' || normRole.includes('admin') || normRole.includes('super');

    if (isAdmin) {
      const [doctors, patients, others] = await Promise.all([
        this.getDoctors(speciality, search, callerId, callerRole),
        this.getPatients(search, callerId, callerRole),
        this.getOtherUsers(search, callerId, callerRole),
      ]);
      return { doctors, patients, others };
    }

    // Doctor or Patient
    const [doctors, others] = await Promise.all([
      this.getDoctors(speciality, search, callerId, callerRole),
      this.getOtherUsers(search, callerId, callerRole),
    ]);
    return { doctors, others };
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
      const normRole = (role || '').toLowerCase();
      const isAdmin = normRole === 'admin' || normRole.includes('admin') || normRole.includes('super');

      const targetId = targetDoctorId || targetPatientId || recipientId;
      if (!targetId) {
        throw new ValidationError('recipient_id, doctor_id, or patient_id is required');
      }

      // 1. Resolve target entity type and canonical ID
      let isTargetDoctor = Boolean(targetDoctorId);
      let isTargetPatient = Boolean(targetPatientId);
      let canonicalTargetId = targetId;

      if (!isTargetDoctor && !isTargetPatient) {
        const { rows: dRows } = await client.query(
          `SELECT id, user_account_id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [targetId],
        );
        if (dRows.length > 0) {
          isTargetDoctor = true;
          canonicalTargetId = dRows[0].id;
        } else {
          const { rows: pRows } = await client.query(
            `SELECT id, user_account_id, user_id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 OR (user_id IS NOT NULL AND user_id::text = $1) LIMIT 1`,
            [targetId],
          );
          if (pRows.length > 0) {
            isTargetPatient = true;
            canonicalTargetId = pRows[0].id;
          }
        }
      } else if (isTargetDoctor) {
        const { rows: dRows } = await client.query(
          `SELECT id FROM doctors WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [targetId],
        );
        if (dRows.length > 0) canonicalTargetId = dRows[0].id;
      } else if (isTargetPatient) {
        const { rows: pRows } = await client.query(
          `SELECT id FROM patients WHERE id::text = $1 OR user_account_id::text = $1 LIMIT 1`,
          [targetId],
        );
        if (pRows.length > 0) canonicalTargetId = pRows[0].id;
      }

      // 2. Prevent user chatting with themselves
      const callerAllIds = [
        userId,
        identity.userAccountId,
        identity.doctorId,
        identity.patientId,
      ].filter(Boolean) as string[];
      if (callerAllIds.includes(canonicalTargetId) || callerAllIds.includes(targetId)) {
        throw new ValidationError('Cannot create a conversation with yourself');
      }

      // 3. Check for existing conversation bi-directionally
      let conv = await chatRepo.findConversationByParticipants(callerAllIds, [
        canonicalTargetId,
        targetId,
      ]);
      if (conv) {
        return {
          ...conv,
          id: conv.id,
          conversation_id: conv.id,
        };
      }

      // 4. Assign patient_id and doctor_id deterministically
      let patientId: string;
      let doctorId: string;

      const callerDoctorId = identity.doctorId;
      const callerPatientId = identity.patientId;

      if (isTargetDoctor && (callerPatientId || !isAdmin)) {
        patientId = callerPatientId || userId;
        doctorId = canonicalTargetId;
      } else if (isTargetPatient && (callerDoctorId || !isAdmin)) {
        patientId = canonicalTargetId;
        doctorId = callerDoctorId || userId;
      } else if (isAdmin && isTargetPatient) {
        patientId = canonicalTargetId;
        doctorId = userId;
      } else if (isAdmin && isTargetDoctor) {
        patientId = userId;
        doctorId = canonicalTargetId;
      } else {
        // Peer to peer (Admin ↔ Admin, Doctor ↔ Doctor, etc.)
        const sorted = [userId, canonicalTargetId].sort();
        patientId = sorted[0]!;
        doctorId = sorted[1]!;
      }

      conv = await chatRepo.createConversation(patientId, doctorId);
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
    const callerIds = Array.from(
      new Set(
        [
          userId,
          identity.userAccountId,
          identity.doctorId,
          identity.patientId,
          ...(identity.doctorIds || []),
          ...(identity.patientIds || []),
        ].filter(Boolean) as string[],
      ),
    );

    const convs = await chatRepo.getAllConversationsForUser(callerIds);

    return Promise.all(
      convs.map(async (c) => {
        const isCallerPatient = callerIds.includes(c.patient_id);
        const otherId = isCallerPatient ? c.doctor_id : c.patient_id;
        const otherName = isCallerPatient ? c.doctor_name : c.patient_name;
        const rawOtherAvatar = isCallerPatient
          ? c.doctor_avatar || c.profile_image_url
          : c.patient_avatar || c.patient_profile_image;
        const signedOtherAvatar = await signProfileImageUrl(rawOtherAvatar);

        const rawDoctorImg =
          c.profile_image_url || c.doctor_profile_image || c.doctor_avatar || null;
        const signedDoctorImg = await signProfileImageUrl(rawDoctorImg);
        const signedPatientImg = await signProfileImageUrl(
          c.patient_profile_image || c.patient_avatar || null,
        );

        const isOtherOnline = presenceManager.isUserOnline(otherId);

        return {
          ...c,
          id: c.id,
          conversation_id: c.id,
          conversationId: c.id,
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
          doctor_online: presenceManager.isUserOnline(c.doctor_id),
          patient_name: c.patient_name || 'Patient',
          patientName: c.patient_name || 'Patient',
          patient_phone: c.patient_phone || '',
          patientPhone: c.patient_phone || '',
          patient_profile_image: signedPatientImg || '',
          patient_avatar: signedPatientImg || '',
          patient_online: presenceManager.isUserOnline(c.patient_id),
          recipient_id: otherId,
          recipientId: otherId,
          recipient_name: otherName || 'User',
          other_participant_name: otherName || 'User',
          name: otherName || 'User',
          avatar_url: signedOtherAvatar || '',
          recipient_avatar: signedOtherAvatar || '',
          is_online: isOtherOnline,
          unread_count: Number(c.unread_count || 0),
          unreadCount: Number(c.unread_count || 0),
          last_message: c.last_message || null,
          lastMessage: c.last_message || null,
          last_message_at: c.last_message_at || c.updated_at || null,
          lastMessageAt: c.last_message_at || c.updated_at || null,
        };
      }),
    );
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
    const callerIds = Array.from(
      new Set(
        [
          userId,
          identity.userAccountId,
          identity.doctorId,
          identity.patientId,
          ...(identity.doctorIds || []),
          ...(identity.patientIds || []),
        ].filter(Boolean) as string[],
      ),
    );

    const isPatientMatch = callerIds.some(
      (id) => conv.patient_id === id || String(conv.patient_id) === String(id),
    );
    const isDoctorMatch = callerIds.some(
      (id) => conv.doctor_id === id || String(conv.doctor_id) === String(id),
    );

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
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ];

    const ext = (file.fileName.toLowerCase().split('.').pop() || '').trim();
    const allowedExts = [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'csv',
      'txt',
    ];

    const normalizedMime = (file.mimeType || '').toLowerCase();
    const isAllowed =
      allowedMimes.includes(normalizedMime) ||
      normalizedMime.startsWith('image/') ||
      allowedExts.includes(ext);

    if (!isAllowed) {
      throw new ValidationError(
        'Invalid file type. Only images (JPG, PNG, WEBP), documents (PDF, DOC, DOCX), and spreadsheets (XLS, XLSX, CSV) are allowed.',
      );
    }

    const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
    if (file.fileSize > MAX_SIZE) {
      throw new ValidationError('File size exceeds the 15 MB limit.');
    }

    const safeFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `chat/${conversationId}/${Date.now()}_${safeFileName}`;
    let contentType = normalizedMime;
    if (!contentType || contentType === 'application/octet-stream') {
      if (ext === 'pdf') contentType = 'application/pdf';
      else if (ext === 'doc') contentType = 'application/msword';
      else if (ext === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'xls') contentType = 'application/vnd.ms-excel';
      else if (ext === 'xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === 'csv') contentType = 'text/csv';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else contentType = 'application/octet-stream';
    }

    await s3Service.uploadBuffer(storageKey, file.buffer, contentType);
    const signedUrl = await s3Service.getReadUrl(storageKey, 86400);

    let messageType = 'DOCUMENT';
    if (normalizedMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      messageType = 'IMAGE';
    } else if (normalizedMime.includes('pdf') || ext === 'pdf') {
      messageType = 'PDF';
    } else if (['xls', 'xlsx', 'csv'].includes(ext) || normalizedMime.includes('excel') || normalizedMime.includes('spreadsheet') || normalizedMime.includes('csv')) {
      messageType = 'SPREADSHEET';
    }
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

