import { pool } from '@/db/pool.js';

import type {
  ChatConversation,
  ChatMessage,
  QuotedMessagePreview,
  SenderType,
} from './chat.types.js';

let tablesInitialized = false;

export async function ensureChatTables(): Promise<void> {
  if (tablesInitialized) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL,
        doctor_id UUID NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        last_message_id UUID,
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_chat_conversation_patient_doctor UNIQUE (patient_id, doctor_id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL,
        sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('PATIENT', 'DOCTOR')),
        message_type VARCHAR(32) NOT NULL DEFAULT 'TEXT',
        message TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'DELIVERED', 'READ')),
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_conversations_patient_id ON chat_conversations(patient_id);
      CREATE INDEX IF NOT EXISTS idx_chat_conversations_doctor_id ON chat_conversations(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created ON chat_messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);

      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS attachment_url TEXT,
        ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(64),
        ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
        ADD COLUMN IF NOT EXISTS storage_key TEXT,
        ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id ON chat_messages(reply_to_message_id);
    `);
    tablesInitialized = true;
  } catch {
    // Ignore error if tables already exist
  } finally {
    client.release();
  }
}

export async function findConversationById(
  id: string,
): Promise<ChatConversation | null> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT c.*,
              c.id as conversation_id,
              m.message as last_message,
              m.sent_at as last_message_at,
              COALESCE(p.name, pp.full_name, 'Patient') as patient_name,
              COALESCE(p.phone, usr.mobile_number, u.username, '') as patient_phone,
              COALESCE(p.profile_image_url, pp.profile_image_url, '') as patient_profile_image,
              COALESCE(p.profile_image_url, pp.profile_image_url, '') as patient_avatar,
              COALESCE(d.name, dp.full_name, 'Doctor') as doctor_name,
              COALESCE(d.specialization, dp.specialty, 'General Medicine') as specialization,
              COALESCE(d.profile_image_url, dp.profile_image_url, '') as doctor_profile_image,
              COALESCE(d.profile_image_url, dp.profile_image_url, '') as doctor_avatar
       FROM chat_conversations c
       LEFT JOIN chat_messages m ON c.last_message_id = m.id
       LEFT JOIN patients p ON (c.patient_id = p.id OR c.patient_id = p.user_account_id OR (p.user_id IS NOT NULL AND c.patient_id = p.user_id))
       LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (c.patient_id = pp.user_id)
       LEFT JOIN user_accounts u ON (p.user_account_id = u.id OR c.patient_id = u.id)
       LEFT JOIN users usr ON (c.patient_id = usr.id OR (p.user_id IS NOT NULL AND p.user_id = usr.id))
       LEFT JOIN doctors d ON (c.doctor_id = d.id OR c.doctor_id = d.user_account_id)
       LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (c.doctor_id = dp.user_id)
       WHERE c.id = $1`,
      [id],
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

export async function findConversationByPatientDoctor(
  patientIdOrIds: string | string[],
  doctorIdOrIds: string | string[],
): Promise<ChatConversation | null> {
  await ensureChatTables();
  const client = await pool.connect();
  const patientIds = Array.isArray(patientIdOrIds) ? patientIdOrIds : [patientIdOrIds];
  const doctorIds = Array.isArray(doctorIdOrIds) ? doctorIdOrIds : [doctorIdOrIds];

  try {
    const { rows } = await client.query(
      `SELECT c.*,
              c.id as conversation_id,
              m.message as last_message,
              (
                SELECT COUNT(*)::int
                FROM chat_messages unread_m
                WHERE unread_m.conversation_id = c.id
                  AND unread_m.sender_type = 'DOCTOR'
                  AND unread_m.status != 'READ'
              ) as unread_count
       FROM chat_conversations c
       LEFT JOIN chat_messages m ON c.last_message_id = m.id
       WHERE (
         c.patient_id = ANY($1::uuid[])
         OR c.patient_id IN (
           SELECT p.id FROM patients p
           WHERE p.user_account_id = ANY($1::uuid[]) OR p.id = ANY($1::uuid[]) OR (p.user_id IS NOT NULL AND p.user_id = ANY($1::uuid[]))
         )
         OR c.patient_id IN (
           SELECT pp.user_id FROM patient_profiles pp WHERE pp.user_id = ANY($1::uuid[])
         )
       ) AND (
         c.doctor_id = ANY($2::uuid[])
         OR c.doctor_id IN (
           SELECT d.id FROM doctors d
           WHERE d.user_account_id = ANY($2::uuid[]) OR d.id = ANY($2::uuid[])
         )
         OR c.doctor_id IN (
           SELECT dp.user_id FROM doctor_profiles dp WHERE dp.user_id = ANY($2::uuid[])
         )
       )
       LIMIT 1`,
      [patientIds, doctorIds],
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

export async function createConversation(
  patientId: string,
  doctorId: string,
): Promise<ChatConversation> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO chat_conversations (patient_id, doctor_id, status, created_at, updated_at)
       VALUES ($1, $2, 'ACTIVE', NOW(), NOW())
       ON CONFLICT (patient_id, doctor_id) DO UPDATE 
       SET updated_at = NOW()
       RETURNING *`,
      [patientId, doctorId],
    );
    return rows[0];
  } finally {
    client.release();
  }
}

export async function getConversationsForPatient(
  patientIdOrIds: string | string[],
): Promise<ChatConversation[]> {
  await ensureChatTables();
  const client = await pool.connect();
  const patientIds = Array.isArray(patientIdOrIds) ? patientIdOrIds : [patientIdOrIds];

  try {
    const { rows } = await client.query(
      `SELECT c.id,
              c.id as conversation_id,
              c.patient_id,
              c.doctor_id,
              c.status,
              c.last_message_id,
              c.last_message_at,
              c.created_at,
              c.updated_at,
              m.message as last_message,
              COALESCE(d.name, dp.full_name, 'Doctor') as doctor_name,
              COALESCE(d.specialization, dp.specialty, 'General Medicine') as specialization,
              COALESCE(d.profile_image_url, dp.profile_image_url, '') as doctor_avatar,
              COALESCE(d.profile_image_url, dp.profile_image_url, '') as doctor_profile_image,
              COALESCE(d.profile_image_url, dp.profile_image_url, '') as profile_image_url,
              COALESCE(
                (
                  SELECT COUNT(*)::int
                  FROM chat_messages unread_m
                  WHERE unread_m.conversation_id = c.id
                    AND unread_m.sender_type = 'DOCTOR'
                    AND unread_m.status != 'READ'
                ),
                0
              ) as unread_count
       FROM chat_conversations c
       LEFT JOIN chat_messages m ON c.last_message_id = m.id
       LEFT JOIN doctors d ON (c.doctor_id = d.id OR c.doctor_id = d.user_account_id)
       LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (c.doctor_id = dp.user_id)
       WHERE c.patient_id = ANY($1::uuid[])
          OR c.patient_id IN (
            SELECT p.id FROM patients p
            WHERE p.user_account_id = ANY($1::uuid[]) OR p.id = ANY($1::uuid[]) OR (p.user_id IS NOT NULL AND p.user_id = ANY($1::uuid[]))
          )
          OR c.patient_id IN (
            SELECT pp.user_id FROM patient_profiles pp WHERE pp.user_id = ANY($1::uuid[])
          )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [patientIds],
    );
    return rows;
  } finally {
    client.release();
  }
}

export async function getConversationsForDoctor(
  doctorIdOrIds: string | string[],
): Promise<ChatConversation[]> {
  await ensureChatTables();
  const client = await pool.connect();
  const doctorIds = Array.isArray(doctorIdOrIds) ? doctorIdOrIds : [doctorIdOrIds];

  try {
    const { rows } = await client.query(
      `SELECT c.id,
              c.id as conversation_id,
              c.patient_id,
              c.doctor_id,
              c.status,
              c.last_message_id,
              c.last_message_at,
              c.created_at,
              c.updated_at,
              m.message as last_message,
              COALESCE(p.name, pp.full_name, 'Patient') as patient_name,
              COALESCE(p.phone, usr.mobile_number, u.username, '') as patient_phone,
              COALESCE(p.profile_image_url, pp.profile_image_url, '') as patient_profile_image,
              COALESCE(p.profile_image_url, pp.profile_image_url, '') as patient_avatar,
              COALESCE(p.profile_image_url, pp.profile_image_url, '') as profile_image_url,
              COALESCE(
                (
                  SELECT COUNT(*)::int
                  FROM chat_messages unread_m
                  WHERE unread_m.conversation_id = c.id
                    AND unread_m.sender_type = 'PATIENT'
                    AND unread_m.status != 'READ'
                ),
                0
              ) as unread_count
       FROM chat_conversations c
       LEFT JOIN chat_messages m ON c.last_message_id = m.id
       LEFT JOIN patients p ON (c.patient_id = p.id OR c.patient_id = p.user_account_id OR (p.user_id IS NOT NULL AND c.patient_id = p.user_id))
       LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (c.patient_id = pp.user_id)
       LEFT JOIN user_accounts u ON (p.user_account_id = u.id OR c.patient_id = u.id)
       LEFT JOIN users usr ON (c.patient_id = usr.id OR (p.user_id IS NOT NULL AND p.user_id = usr.id))
       WHERE c.doctor_id = ANY($1::uuid[])
          OR c.doctor_id IN (
            SELECT d.id FROM doctors d
            WHERE d.user_account_id = ANY($1::uuid[]) OR d.id = ANY($1::uuid[])
          )
          OR c.doctor_id IN (
            SELECT dp.user_id FROM doctor_profiles dp WHERE dp.user_id = ANY($1::uuid[])
          )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [doctorIds],
    );
    return rows;
  } finally {
    client.release();
  }
}

export async function saveMessage(
  conversationId: string,
  senderId: string,
  senderType: SenderType,
  messageText: string,
  messageType = 'TEXT',
  attachmentData?: {
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentType?: string | null;
    attachmentSize?: number | null;
    storageKey?: string | null;
  },
  replyToMessageId?: string | null,
): Promise<ChatMessage> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let validatedReplyToId: string | null = null;
    let replyToPreview: QuotedMessagePreview | null = null;

    if (replyToMessageId) {
      const { rows: checkRows } = await client.query(
        `SELECT m.id, m.sender_type, m.sender_id, m.message, m.message_type,
                m.attachment_url, m.attachment_name, m.attachment_type,
                COALESCE(p.name, pp.full_name, d.name, dp.full_name) as sender_name
         FROM chat_messages m
         LEFT JOIN patients p ON (m.sender_id = p.id OR m.sender_id = p.user_account_id)
         LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (m.sender_id = pp.user_id)
         LEFT JOIN doctors d ON (m.sender_id = d.id OR m.sender_id = d.user_account_id)
         LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (m.sender_id = dp.user_id)
         WHERE m.id = $1 AND m.conversation_id = $2
         LIMIT 1`,
        [replyToMessageId, conversationId],
      );

      if (checkRows.length > 0) {
        const pr = checkRows[0];
        validatedReplyToId = pr.id;
        replyToPreview = {
          id: pr.id,
          sender_type: pr.sender_type,
          senderType: pr.sender_type,
          sender_id: pr.sender_id,
          senderId: pr.sender_id,
          sender_name: pr.sender_name || (pr.sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
          senderName: pr.sender_name || (pr.sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
          message: pr.message,
          content: pr.message,
          message_type: pr.message_type,
          messageType: pr.message_type,
          attachment_url: pr.attachment_url,
          attachmentUrl: pr.attachment_url,
          attachment_name: pr.attachment_name,
          attachmentName: pr.attachment_name,
          attachment_type: pr.attachment_type,
          attachmentType: pr.attachment_type,
          is_deleted: false,
          isDeleted: false,
        };
      }
    }

    const { rows: msgRows } = await client.query(
      `INSERT INTO chat_messages (
         conversation_id, sender_id, sender_type, message_type, message, status,
         attachment_url, attachment_name, attachment_type, attachment_size, storage_key,
         reply_to_message_id, sent_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'SENT', $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        conversationId,
        senderId,
        senderType,
        messageType,
        messageText,
        attachmentData?.attachmentUrl ?? null,
        attachmentData?.attachmentName ?? null,
        attachmentData?.attachmentType ?? null,
        attachmentData?.attachmentSize ?? null,
        attachmentData?.storageKey ?? null,
        validatedReplyToId,
      ],
    );

    const savedMsg: ChatMessage = msgRows[0];
    if (replyToPreview) {
      savedMsg.reply_to = replyToPreview;
      savedMsg.replyTo = replyToPreview;
      savedMsg.reply_to_message_id = replyToPreview.id;
      savedMsg.replyToMessageId = replyToPreview.id;
    }

    await client.query(
      `UPDATE chat_conversations
       SET last_message_id = $1,
           last_message_at = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [savedMsg.id, savedMsg.sent_at, conversationId],
    );

    await client.query('COMMIT');
    return savedMsg;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findMessageById(
  messageId: string,
): Promise<ChatMessage | null> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 
        m.*,
        parent_m.id as parent_id,
        parent_m.sender_type as parent_sender_type,
        parent_m.sender_id as parent_sender_id,
        parent_m.message as parent_message,
        parent_m.message_type as parent_message_type,
        parent_m.attachment_url as parent_attachment_url,
        parent_m.attachment_name as parent_attachment_name,
        parent_m.attachment_type as parent_attachment_type,
        COALESCE(p.name, pp.full_name, d.name, dp.full_name) as parent_sender_name
       FROM chat_messages m
       LEFT JOIN chat_messages parent_m ON m.reply_to_message_id = parent_m.id
       LEFT JOIN patients p ON (parent_m.sender_id = p.id OR parent_m.sender_id = p.user_account_id)
       LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (parent_m.sender_id = pp.user_id)
       LEFT JOIN doctors d ON (parent_m.sender_id = d.id OR parent_m.sender_id = d.user_account_id)
       LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (parent_m.sender_id = dp.user_id)
       WHERE m.id = $1 LIMIT 1`,
      [messageId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    let replyToPreview: QuotedMessagePreview | null = null;
    if (r.reply_to_message_id) {
      if (r.parent_id) {
        replyToPreview = {
          id: r.parent_id,
          sender_type: r.parent_sender_type,
          senderType: r.parent_sender_type,
          sender_id: r.parent_sender_id,
          senderId: r.parent_sender_id,
          sender_name: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
          senderName: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
          message: r.parent_message,
          content: r.parent_message,
          message_type: r.parent_message_type,
          messageType: r.parent_message_type,
          attachment_url: r.parent_attachment_url,
          attachmentUrl: r.parent_attachment_url,
          attachment_name: r.parent_attachment_name,
          attachmentName: r.parent_attachment_name,
          attachment_type: r.parent_attachment_type,
          attachmentType: r.parent_attachment_type,
          is_deleted: false,
          isDeleted: false,
        };
      } else {
        replyToPreview = {
          id: r.reply_to_message_id,
          is_deleted: true,
          isDeleted: true,
        };
      }
    }
    return {
      ...r,
      is_deleted: Boolean(r.is_deleted),
      isDeleted: Boolean(r.is_deleted),
      deleted_at: r.deleted_at || null,
      deletedAt: r.deleted_at || null,
      reply_to_message_id: r.reply_to_message_id || null,
      replyToMessageId: r.reply_to_message_id || null,
      reply_to: replyToPreview,
      replyTo: replyToPreview,
    };
  } finally {
    client.release();
  }
}

export async function getMessagesByConversation(
  conversationId: string,
  limit = 30,
  beforeId?: string,
): Promise<ChatMessage[]> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    let query = `
      SELECT 
        m.*,
        parent_m.id as parent_id,
        parent_m.sender_type as parent_sender_type,
        parent_m.sender_id as parent_sender_id,
        parent_m.message as parent_message,
        parent_m.message_type as parent_message_type,
        parent_m.attachment_url as parent_attachment_url,
        parent_m.attachment_name as parent_attachment_name,
        parent_m.attachment_type as parent_attachment_type,
        COALESCE(p.name, pp.full_name, d.name, dp.full_name) as parent_sender_name
      FROM chat_messages m
      LEFT JOIN chat_messages parent_m ON m.reply_to_message_id = parent_m.id
      LEFT JOIN patients p ON (parent_m.sender_id = p.id OR parent_m.sender_id = p.user_account_id)
      LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (parent_m.sender_id = pp.user_id)
      LEFT JOIN doctors d ON (parent_m.sender_id = d.id OR parent_m.sender_id = d.user_account_id)
      LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (parent_m.sender_id = dp.user_id)
      WHERE m.conversation_id = $1
    `;
    const params: any[] = [conversationId];

    if (beforeId) {
      params.push(beforeId);
      query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = $${params.length})`;
    }

    params.push(limit);
    query += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

    const { rows } = await client.query(query, params);
    const mapped: ChatMessage[] = rows.map((r: any) => {
      let replyToPreview: QuotedMessagePreview | null = null;
      if (r.reply_to_message_id) {
        if (r.parent_id) {
          replyToPreview = {
            id: r.parent_id,
            sender_type: r.parent_sender_type,
            senderType: r.parent_sender_type,
            sender_id: r.parent_sender_id,
            senderId: r.parent_sender_id,
            sender_name: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
            senderName: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
            message: r.parent_message,
            content: r.parent_message,
            message_type: r.parent_message_type,
            messageType: r.parent_message_type,
            attachment_url: r.parent_attachment_url,
            attachmentUrl: r.parent_attachment_url,
            attachment_name: r.parent_attachment_name,
            attachmentName: r.parent_attachment_name,
            attachment_type: r.parent_attachment_type,
            attachmentType: r.parent_attachment_type,
            is_deleted: false,
            isDeleted: false,
          };
        } else {
          replyToPreview = {
            id: r.reply_to_message_id,
            is_deleted: true,
            isDeleted: true,
          };
        }
      }
      return {
        ...r,
        is_deleted: Boolean(r.is_deleted),
        isDeleted: Boolean(r.is_deleted),
        deleted_at: r.deleted_at || null,
        deletedAt: r.deleted_at || null,
        reply_to_message_id: r.reply_to_message_id || null,
        replyToMessageId: r.reply_to_message_id || null,
        reply_to: replyToPreview,
        replyTo: replyToPreview,
      };
    });
    // Reverse to return in chronological order (oldest to newest)
    return mapped.reverse();
  } finally {
    client.release();
  }
}

export async function searchMessagesInConversation(
  conversationId: string,
  query: string,
  limit = 30,
  offset = 0,
): Promise<ChatMessage[]> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escapedQuery}%`;

    const sql = `
      SELECT 
        m.*,
        COALESCE(p.name, pp.full_name, d.name, dp.full_name) as sender_name,
        parent_m.id as parent_id,
        parent_m.sender_type as parent_sender_type,
        parent_m.sender_id as parent_sender_id,
        parent_m.message as parent_message,
        parent_m.message_type as parent_message_type,
        parent_m.attachment_url as parent_attachment_url,
        parent_m.attachment_name as parent_attachment_name,
        parent_m.attachment_type as parent_attachment_type,
        COALESCE(parent_p.name, parent_pp.full_name, parent_d.name, parent_dp.full_name) as parent_sender_name
      FROM chat_messages m
      LEFT JOIN patients p ON (m.sender_id = p.id OR m.sender_id = p.user_account_id)
      LEFT JOIN patient_profiles pp ON (p.user_account_id IS NOT NULL AND pp.user_id = p.user_account_id) OR (m.sender_id = pp.user_id)
      LEFT JOIN doctors d ON (m.sender_id = d.id OR m.sender_id = d.user_account_id)
      LEFT JOIN doctor_profiles dp ON (d.user_account_id IS NOT NULL AND dp.user_id = d.user_account_id) OR (m.sender_id = dp.user_id)
      LEFT JOIN chat_messages parent_m ON m.reply_to_message_id = parent_m.id
      LEFT JOIN patients parent_p ON (parent_m.sender_id = parent_p.id OR parent_m.sender_id = parent_p.user_account_id)
      LEFT JOIN patient_profiles parent_pp ON (parent_p.user_account_id IS NOT NULL AND parent_pp.user_id = parent_p.user_account_id) OR (parent_m.sender_id = parent_pp.user_id)
      LEFT JOIN doctors parent_d ON (parent_m.sender_id = parent_d.id OR parent_m.sender_id = parent_d.user_account_id)
      LEFT JOIN doctor_profiles parent_dp ON (parent_d.user_account_id IS NOT NULL AND parent_dp.user_id = parent_d.user_account_id) OR (parent_m.sender_id = parent_dp.user_id)
      WHERE m.conversation_id = $1
        AND (m.is_deleted IS NOT TRUE)
        AND (
          m.message ILIKE $2
          OR (m.attachment_name IS NOT NULL AND m.attachment_name ILIKE $2)
        )
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const { rows } = await client.query(sql, [
      conversationId,
      searchPattern,
      limit,
      offset,
    ]);

    return rows.map((r: any) => {
      let replyToPreview: QuotedMessagePreview | null = null;
      if (r.reply_to_message_id) {
        if (r.parent_id) {
          replyToPreview = {
            id: r.parent_id,
            sender_type: r.parent_sender_type,
            senderType: r.parent_sender_type,
            sender_id: r.parent_sender_id,
            senderId: r.parent_sender_id,
            sender_name: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
            senderName: r.parent_sender_name || (r.parent_sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
            message: r.parent_message,
            content: r.parent_message,
            message_type: r.parent_message_type,
            messageType: r.parent_message_type,
            attachment_url: r.parent_attachment_url,
            attachmentUrl: r.parent_attachment_url,
            attachment_name: r.parent_attachment_name,
            attachmentName: r.parent_attachment_name,
            attachment_type: r.parent_attachment_type,
            attachmentType: r.parent_attachment_type,
            is_deleted: false,
            isDeleted: false,
          };
        } else {
          replyToPreview = {
            id: r.reply_to_message_id,
            is_deleted: true,
            isDeleted: true,
          };
        }
      }

      return {
        ...r,
        is_deleted: Boolean(r.is_deleted),
        isDeleted: Boolean(r.is_deleted),
        deleted_at: r.deleted_at || null,
        deletedAt: r.deleted_at || null,
        sender_name: r.sender_name || (r.sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
        senderName: r.sender_name || (r.sender_type === 'DOCTOR' ? 'Doctor' : 'Patient'),
        reply_to_message_id: r.reply_to_message_id || null,
        replyToMessageId: r.reply_to_message_id || null,
        reply_to: replyToPreview,
        replyTo: replyToPreview,
      };
    });
  } finally {
    client.release();
  }
}

export async function markMessagesAsRead(
  conversationId: string,
  readerSenderType: SenderType,
  messageIds?: string[],
): Promise<string[]> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const targetSenderType = readerSenderType === 'PATIENT' ? 'DOCTOR' : 'PATIENT';
    let query = `
      UPDATE chat_messages
      SET status = 'READ',
          read_at = COALESCE(read_at, NOW()),
          delivered_at = COALESCE(delivered_at, NOW()),
          updated_at = NOW()
      WHERE conversation_id = $1
        AND sender_type = $2
        AND status != 'READ'
    `;
    const params: any[] = [conversationId, targetSenderType];

    if (messageIds && messageIds.length > 0) {
      params.push(messageIds);
      query += ` AND id = ANY($3::uuid[])`;
    }

    query += ` RETURNING id`;

    const { rows } = await client.query(query, params);
    return rows.map(r => r.id);
  } finally {
    client.release();
  }
}

export async function markMessagesAsDelivered(
  conversationId: string,
  recipientSenderType: SenderType,
  messageIds?: string[],
): Promise<string[]> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const targetSenderType = recipientSenderType === 'PATIENT' ? 'DOCTOR' : 'PATIENT';
    let query = `
      UPDATE chat_messages
      SET status = 'DELIVERED',
          delivered_at = COALESCE(delivered_at, NOW()),
          updated_at = NOW()
      WHERE conversation_id = $1
        AND sender_type = $2
        AND status = 'SENT'
    `;
    const params: any[] = [conversationId, targetSenderType];

    if (messageIds && messageIds.length > 0) {
      params.push(messageIds);
      query += ` AND id = ANY($3::uuid[])`;
    }

    query += ` RETURNING id`;

    const { rows } = await client.query(query, params);
    return rows.map(r => r.id);
  } finally {
    client.release();
  }
}

export interface PendingDeliveryResult {
  conversationId: string;
  messageIds: string[];
  senderUserId?: string;
}

export async function markPendingMessagesDeliveredForRecipient(
  recipientIds: string | string[],
  recipientSenderType: SenderType,
): Promise<PendingDeliveryResult[]> {
  await ensureChatTables();
  const client = await pool.connect();
  const ids = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
  const targetSenderType = recipientSenderType === 'PATIENT' ? 'DOCTOR' : 'PATIENT';

  try {
    const query = `
      UPDATE chat_messages
      SET status = 'DELIVERED',
          delivered_at = COALESCE(delivered_at, NOW()),
          updated_at = NOW()
      WHERE conversation_id IN (
        SELECT id FROM chat_conversations
        WHERE (
          $1::text = 'PATIENT' AND (
            patient_id = ANY($2::uuid[])
            OR patient_id IN (
              SELECT p.id FROM patients p
              WHERE p.user_account_id = ANY($2::uuid[]) OR p.id = ANY($2::uuid[]) OR (p.user_id IS NOT NULL AND p.user_id = ANY($2::uuid[]))
            )
            OR patient_id IN (
              SELECT pp.user_id FROM patient_profiles pp WHERE pp.user_id = ANY($2::uuid[])
            )
          )
        ) OR (
          $1::text = 'DOCTOR' AND (
            doctor_id = ANY($2::uuid[])
            OR doctor_id IN (
              SELECT d.id FROM doctors d
              WHERE d.user_account_id = ANY($2::uuid[]) OR d.id = ANY($2::uuid[])
            )
            OR doctor_id IN (
              SELECT dp.user_id FROM doctor_profiles dp WHERE dp.user_id = ANY($2::uuid[])
            )
          )
        )
      )
      AND sender_type = $3
      AND status = 'SENT'
      RETURNING id, conversation_id, sender_id;
    `;
    const { rows } = await client.query(query, [
      recipientSenderType,
      ids,
      targetSenderType,
    ]);

    const map = new Map<string, { conversationId: string; messageIds: string[]; senderUserId?: string }>();
    for (const r of rows) {
      if (!map.has(r.conversation_id)) {
        map.set(r.conversation_id, {
          conversationId: r.conversation_id,
          messageIds: [],
          senderUserId: r.sender_id || undefined,
        });
      }
      map.get(r.conversation_id)!.messageIds.push(r.id);
    }
    return Array.from(map.values());
  } finally {
    client.release();
  }
}

export async function deleteMessage(
  messageId: string,
  conversationId: string,
): Promise<ChatMessage | null> {
  await ensureChatTables();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE chat_messages
       SET is_deleted = TRUE,
           deleted_at = NOW(),
           message = 'This message was deleted',
           attachment_url = NULL,
           attachment_name = NULL,
           attachment_type = NULL,
           attachment_size = NULL,
           storage_key = NULL,
           updated_at = NOW()
       WHERE id = $1 AND conversation_id = $2
       RETURNING *`,
      [messageId, conversationId],
    );

    if (rows.length === 0) return null;

    // Update conversation updated_at if this was the last message
    await client.query(
      `UPDATE chat_conversations
       SET updated_at = NOW()
       WHERE id = $1 AND last_message_id = $2`,
      [conversationId, messageId],
    );

    const r = rows[0];
    return {
      ...r,
      is_deleted: true,
      isDeleted: true,
      deleted_at: r.deleted_at,
      deletedAt: r.deleted_at,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      senderType: r.sender_type,
      messageType: r.message_type,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      attachmentUrl: null,
      attachmentName: null,
      attachmentType: null,
      attachmentSize: null,
      storageKey: null,
      replyToMessageId: r.reply_to_message_id || null,
      reply_to_message_id: r.reply_to_message_id || null,
    };
  } finally {
    client.release();
  }
}
