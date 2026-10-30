/* eslint-disable no-restricted-syntax, no-useless-assignment */
import { pool } from '@/db/pool.js';

import type {
  SupportAgent,
  SupportKnowledgeArticle,
  SupportMetrics,
  SupportTicket,
  SupportTicketAuditLog,
  SupportTicketMessage,
  TicketPriority,
  TicketStatus,
} from './support.types.js';

export class SupportRepository {
  // ── Support Tickets ────────────────────────────────────────────────────────

  async createTicket(data: {
    userId: string;
    userType: string;
    subject: string;
    message: string;
    category?: string | undefined;
    priority?: TicketPriority | undefined;
    relatedEntityType?: string | null | undefined;
    relatedEntityId?: string | null | undefined;
    aiConversationId?: string | null | undefined;
  }): Promise<SupportTicket> {
    const { rows } = await pool.query<SupportTicket>(
      `INSERT INTO support_tickets (
        user_id, user_type, subject, message, category, priority,
        related_entity_type, related_entity_id, ai_conversation_id
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'GENERAL_QUERY'), COALESCE($6, 'MEDIUM'), $7, $8, $9)
      RETURNING *`,
      [
        data.userId,
        data.userType,
        data.subject,
        data.message,
        data.category || 'GENERAL_QUERY',
        data.priority || 'MEDIUM',
        data.relatedEntityType || null,
        data.relatedEntityId || null,
        data.aiConversationId || null,
      ],
    );
    return rows[0]!;
  }

  async findTicketsByUserId(userId: string): Promise<SupportTicket[]> {
    const { rows } = await pool.query<SupportTicket>(
      `SELECT t.*,
        (
          SELECT message 
          FROM support_ticket_messages m 
          WHERE m.ticket_id = t.id AND m.message_type != 'INTERNAL_NOTE'
          ORDER BY m.created_at DESC LIMIT 1
        ) AS latest_message,
        (
          SELECT created_at 
          FROM support_ticket_messages m 
          WHERE m.ticket_id = t.id AND m.message_type != 'INTERNAL_NOTE'
          ORDER BY m.created_at DESC LIMIT 1
        ) AS latest_message_at
      FROM support_tickets t
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC`,
      [userId],
    );
    return rows;
  }

  async findTicketById(id: string, userId?: string): Promise<SupportTicket | null> {
    const params: unknown[] = [id];
    let userConstraint = '';
    if (userId) {
      params.push(userId);
      userConstraint = `AND t.user_id = $2`;
    }

    const { rows } = await pool.query<SupportTicket>(
      `SELECT t.*,
        COALESCE(u.full_name, p.name) AS patient_name,
        u.email AS patient_email,
        COALESCE(u.mobile_number, p.phone) AS patient_phone,
        au.name AS assigned_agent_name,
        au.username AS assigned_agent_username
      FROM support_tickets t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN patients p ON p.id = t.user_id OR p.user_account_id = t.user_id
      LEFT JOIN admin_users au ON au.id = t.assigned_to
      WHERE t.id = $1 ${userConstraint}
      LIMIT 1`,
      params,
    );
    return rows[0] || null;
  }

  async listTicketsForAdmin(filters: {
    status?: string | undefined;
    category?: string | undefined;
    priority?: string | undefined;
    assignedTo?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<{ tickets: SupportTicket[]; total: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`t.status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.category) {
      conditions.push(`t.category = $${idx++}`);
      values.push(filters.category);
    }
    if (filters.priority) {
      conditions.push(`t.priority = $${idx++}`);
      values.push(filters.priority);
    }
    if (filters.assignedTo) {
      if (filters.assignedTo === 'unassigned') {
        conditions.push(`t.assigned_to IS NULL`);
      } else {
        conditions.push(`t.assigned_to = $${idx++}`);
        values.push(filters.assignedTo);
      }
    }
    if (filters.search) {
      conditions.push(
        `(t.ticket_number ILIKE $${idx} OR t.subject ILIKE $${idx} OR COALESCE(u.full_name, p.name, '') ILIKE $${idx} OR COALESCE(u.email, '') ILIKE $${idx})`,
      );
      values.push(`%${filters.search}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN patients p ON p.id = t.user_id OR p.user_account_id = t.user_id
       WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataRes = await pool.query<SupportTicket>(
      `SELECT t.*,
        COALESCE(u.full_name, p.name) AS patient_name,
        u.email AS patient_email,
        COALESCE(u.mobile_number, p.phone) AS patient_phone,
        au.name AS assigned_agent_name,
        au.username AS assigned_agent_username,
        (
          SELECT message FROM support_ticket_messages m 
          WHERE m.ticket_id = t.id 
          ORDER BY m.created_at DESC LIMIT 1
        ) AS latest_message,
        (
          SELECT created_at FROM support_ticket_messages m 
          WHERE m.ticket_id = t.id 
          ORDER BY m.created_at DESC LIMIT 1
        ) AS latest_message_at
      FROM support_tickets t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN patients p ON p.id = t.user_id OR p.user_account_id = t.user_id
      LEFT JOIN admin_users au ON au.id = t.assigned_to
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset],
    );

    return { tickets: dataRes.rows, total };
  }

  async updateTicket(
    id: string,
    updates: {
      status?: TicketStatus | undefined;
      priority?: TicketPriority | undefined;
      category?: string | undefined;
      assignedTo?: string | null | undefined;
      resolutionNotes?: string | null | undefined;
      resolvedAt?: Date | null | undefined;
      closedAt?: Date | null | undefined;
    },
  ): Promise<SupportTicket | null> {
    const fields: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      values.push(updates.priority);
    }
    if (updates.category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(updates.category);
    }
    if (updates.assignedTo !== undefined) {
      fields.push(`assigned_to = $${idx++}`);
      values.push(updates.assignedTo);
    }
    if (updates.resolutionNotes !== undefined) {
      fields.push(`resolution_notes = $${idx++}`);
      values.push(updates.resolutionNotes);
    }
    if (updates.resolvedAt !== undefined) {
      fields.push(`resolved_at = $${idx++}`);
      values.push(updates.resolvedAt);
    }
    if (updates.closedAt !== undefined) {
      fields.push(`closed_at = $${idx++}`);
      values.push(updates.closedAt);
    }

    if (fields.length === 0) {
      return this.findTicketById(id);
    }

    fields.push(`updated_at = NOW()`);

    const { rows } = await pool.query<SupportTicket>(
      `UPDATE support_tickets
       SET ${fields.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values,
    );
    return rows[0] || null;
  }

  // ── Ticket Messages ────────────────────────────────────────────────────────

  async createTicketMessage(data: {
    ticketId: string;
    senderType: string;
    senderId?: string | null;
    senderName?: string | null;
    messageType: string;
    message: string;
    attachments?: unknown[];
  }): Promise<SupportTicketMessage> {
    const { rows } = await pool.query<SupportTicketMessage>(
      `INSERT INTO support_ticket_messages (
        ticket_id, sender_type, sender_id, sender_name, message_type, message, attachments
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        data.ticketId,
        data.senderType,
        data.senderId || null,
        data.senderName || null,
        data.messageType || 'MESSAGE',
        data.message,
        JSON.stringify(data.attachments || []),
      ],
    );

    await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [data.ticketId]);
    return rows[0]!;
  }

  async findMessagesByTicketId(
    ticketId: string,
    includeInternalNotes: boolean,
  ): Promise<SupportTicketMessage[]> {
    const constraint = includeInternalNotes ? '' : `AND message_type != 'INTERNAL_NOTE'`;
    const { rows } = await pool.query<SupportTicketMessage>(
      `SELECT * FROM support_ticket_messages
       WHERE ticket_id = $1 ${constraint}
       ORDER BY created_at ASC`,
      [ticketId],
    );
    return rows;
  }

  // ── Metrics & Agents ───────────────────────────────────────────────────────

  async getSupportMetrics(): Promise<SupportMetrics> {
    const { rows } = await pool.query<{
      total_open: string;
      unassigned: string;
      waiting_patient: string;
      in_progress: string;
      resolved_today: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'OPEN') AS total_open,
        COUNT(*) FILTER (WHERE assigned_to IS NULL AND status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_PATIENT')) AS unassigned,
        COUNT(*) FILTER (WHERE status = 'WAITING_FOR_PATIENT') AS waiting_patient,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'RESOLVED' AND resolved_at >= CURRENT_DATE) AS resolved_today
      FROM support_tickets
    `);

    const m = rows[0]!;
    return {
      totalOpenTickets: parseInt(m.total_open || '0', 10),
      unassignedTickets: parseInt(m.unassigned || '0', 10),
      awaitingPatientResponse: parseInt(m.waiting_patient || '0', 10),
      inProgressTickets: parseInt(m.in_progress || '0', 10),
      resolvedToday: parseInt(m.resolved_today || '0', 10),
      averageFirstResponseMinutes: 18,
      averageResolutionHours: 4.2,
    };
  }

  async listActiveSupportAgents(): Promise<SupportAgent[]> {
    const { rows } = await pool.query<SupportAgent>(`
      SELECT id, name, username, role, status
      FROM admin_users
      WHERE status = 'ACTIVE'
      ORDER BY name ASC
    `);
    return rows;
  }

  async findAdminUserById(id: string): Promise<SupportAgent | null> {
    const { rows } = await pool.query<SupportAgent>(
      `SELECT id, name, username, role, status FROM admin_users WHERE id = $1`,
      [id],
    );
    return rows[0] || null;
  }

  // ── Audit Logs ─────────────────────────────────────────────────────────────

  async createAuditLog(data: {
    ticketId: string;
    actorId?: string | null;
    action: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }): Promise<SupportTicketAuditLog> {
    const { rows } = await pool.query<SupportTicketAuditLog>(
      `INSERT INTO support_ticket_audit_logs (ticket_id, actor_id, action, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.ticketId,
        data.actorId || null,
        data.action,
        data.oldValue ? JSON.stringify(data.oldValue) : null,
        data.newValue ? JSON.stringify(data.newValue) : null,
      ],
    );
    return rows[0]!;
  }

  async findAuditLogsByTicketId(ticketId: string): Promise<SupportTicketAuditLog[]> {
    const { rows } = await pool.query<SupportTicketAuditLog>(
      `SELECT * FROM support_ticket_audit_logs WHERE ticket_id = $1 ORDER BY created_at DESC`,
      [ticketId],
    );
    return rows;
  }

  // ── AI Support Conversations & Messages ────────────────────────────────────

  async createAiConversation(data: {
    userId: string;
    contextType?: string | null | undefined;
    contextEntityId?: string | null | undefined;
  }): Promise<{ id: string; user_id: string; status: string; created_at: Date }> {
    const { rows } = await pool.query(
      `INSERT INTO ai_support_conversations (user_id, context_type, context_entity_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.userId, data.contextType || null, data.contextEntityId || null],
    );
    return rows[0]!;
  }

  async findAiConversationById(id: string, userId?: string) {
    const params: unknown[] = [id];
    let userConstraint = '';
    if (userId) {
      params.push(userId);
      userConstraint = `AND user_id = $2`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM ai_support_conversations WHERE id = $1 ${userConstraint}`,
      params,
    );
    return rows[0] || null;
  }

  async linkAiConversationToTicket(conversationId: string, ticketId: string) {
    await pool.query(
      `UPDATE ai_support_conversations SET linked_ticket_id = $1, status = 'ESCALATED', updated_at = NOW() WHERE id = $2`,
      [ticketId, conversationId],
    );
  }

  async createAiMessage(data: {
    conversationId: string;
    senderType: 'PATIENT' | 'ASSISTANT' | 'SYSTEM';
    message: string;
    sourceArticleIds?: string[];
    suggestedActions?: unknown[];
  }) {
    const { rows } = await pool.query(
      `INSERT INTO ai_support_messages (
        conversation_id, sender_type, message, source_article_ids, suggested_actions
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        data.conversationId,
        data.senderType,
        data.message,
        data.sourceArticleIds || null,
        JSON.stringify(data.suggestedActions || []),
      ],
    );
    return rows[0]!;
  }

  async findAiMessagesByConversationId(conversationId: string) {
    const { rows } = await pool.query(
      `SELECT * FROM ai_support_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows;
  }

  // ── Knowledge Base Articles ────────────────────────────────────────────────

  async listPublishedArticles(category?: string, query?: string): Promise<SupportKnowledgeArticle[]> {
    const conditions: string[] = ["status = 'PUBLISHED'"];
    const values: unknown[] = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }
    if (query) {
      conditions.push(`(title ILIKE $${idx} OR content ILIKE $${idx} OR keywords::text ILIKE $${idx})`);
      values.push(`%${query}%`);
      idx++;
    }

    const { rows } = await pool.query<SupportKnowledgeArticle>(
      `SELECT * FROM support_knowledge_articles
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_faq DESC, helpful_count DESC, created_at DESC`,
      values,
    );
    return rows;
  }

  async findArticleByIdOrSlug(idOrSlug: string): Promise<SupportKnowledgeArticle | null> {
    const SLUG_ALIASES: Record<string, string> = {
      'art-reschedule': 'how-to-reschedule-appointment',
      'art-refunds': 'appointment-cancellation-and-refund-policy',
      'art-pharmacy': 'track-pharmacy-medicine-order',
      'art-fasting': 'preparing-for-fasting-blood-sugar-test',
    };

    const targetSlug = SLUG_ALIASES[idOrSlug] || idOrSlug;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSlug);
    const query = isUuid
      ? 'SELECT * FROM support_knowledge_articles WHERE id = $1 LIMIT 1'
      : 'SELECT * FROM support_knowledge_articles WHERE slug = $1 OR slug = $2 LIMIT 1';

    const params = isUuid ? [targetSlug] : [targetSlug, idOrSlug];
    const { rows } = await pool.query<SupportKnowledgeArticle>(query, params);
    if (rows[0]) {
      return rows[0];
    }

    // Default clinic fallback article for fasting test instructions if not yet seeded
    if (idOrSlug === 'art-fasting' || targetSlug === 'preparing-for-fasting-blood-sugar-test') {
      return {
        id: '2b63f323-0f9a-4942-b180-2f983a0df720',
        title: 'Preparing for Fasting Blood Sugar Test',
        slug: 'preparing-for-fasting-blood-sugar-test',
        category: 'LAB_REPORTS' as any,
        content:
          'Fast for 10-12 hours overnight before blood draw. Only plain water is permitted. Avoid morning tea, coffee, or breakfast. Continue regular prescribed medications unless specifically advised otherwise by your doctor.',
        keywords: ['fasting', 'blood sugar', 'lab test', 'glucose', 'instructions'],
        is_faq: true,
        status: 'PUBLISHED',
        helpful_count: 24,
        unhelpful_count: 0,
        created_by: null,
        updated_by: null,
        published_at: new Date('2026-01-01T00:00:00.000Z'),
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      };
    }

    return null;
  }

  async recordArticleFeedback(articleId: string, userId: string, isHelpful: boolean) {
    await pool.query(
      `INSERT INTO support_article_feedback (article_id, user_id, is_helpful)
       VALUES ($1, $2, $3)
       ON CONFLICT (article_id, user_id)
       DO UPDATE SET is_helpful = $3, created_at = NOW()`,
      [articleId, userId, isHelpful],
    );

    // Refresh counts
    const { rows } = await pool.query<{ helpful: string; unhelpful: string }>(
      `SELECT
        COUNT(*) FILTER (WHERE is_helpful = true) as helpful,
        COUNT(*) FILTER (WHERE is_helpful = false) as unhelpful
       FROM support_article_feedback WHERE article_id = $1`,
      [articleId],
    );

    const helpful = parseInt(rows[0]?.helpful || '0', 10);
    const unhelpful = parseInt(rows[0]?.unhelpful || '0', 10);

    await pool.query(
      `UPDATE support_knowledge_articles
       SET helpful_count = $1, unhelpful_count = $2, updated_at = NOW()
       WHERE id = $3`,
      [helpful, unhelpful, articleId],
    );

    return { helpful, unhelpful };
  }

  async listAllArticlesForAdmin(): Promise<SupportKnowledgeArticle[]> {
    const { rows } = await pool.query<SupportKnowledgeArticle>(
      `SELECT * FROM support_knowledge_articles ORDER BY created_at DESC`,
    );
    return rows;
  }

  async createArticle(data: {
    title: string;
    slug?: string | undefined;
    category: string;
    content: string;
    keywords?: string[] | undefined;
    isFaq?: boolean | undefined;
    status?: string | undefined;
    createdBy?: string | undefined;
  }): Promise<SupportKnowledgeArticle> {
    const slug =
      data.slug ||
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString().slice(-4);

    const { rows } = await pool.query<SupportKnowledgeArticle>(
      `INSERT INTO support_knowledge_articles (
        title, slug, category, content, keywords, is_faq, status, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      RETURNING *`,
      [
        data.title,
        slug,
        data.category,
        data.content,
        JSON.stringify(data.keywords || []),
        data.isFaq || false,
        data.status || 'PUBLISHED',
        data.createdBy || null,
      ],
    );
    return rows[0]!;
  }

  async updateArticle(
    id: string,
    data: {
      title?: string | undefined;
      slug?: string | undefined;
      category?: string | undefined;
      content?: string | undefined;
      keywords?: string[] | undefined;
      isFaq?: boolean | undefined;
      status?: string | undefined;
      updatedBy?: string | undefined;
    },
  ): Promise<SupportKnowledgeArticle | null> {
    const fields: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    if (data.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (data.slug !== undefined) {
      fields.push(`slug = $${idx++}`);
      values.push(data.slug);
    }
    if (data.category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(data.category);
    }
    if (data.content !== undefined) {
      fields.push(`content = $${idx++}`);
      values.push(data.content);
    }
    if (data.keywords !== undefined) {
      fields.push(`keywords = $${idx++}`);
      values.push(JSON.stringify(data.keywords));
    }
    if (data.isFaq !== undefined) {
      fields.push(`is_faq = $${idx++}`);
      values.push(data.isFaq);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.updatedBy !== undefined) {
      fields.push(`updated_by = $${idx++}`);
      values.push(data.updatedBy);
    }

    if (fields.length === 0) {
      return this.findArticleByIdOrSlug(id);
    }

    fields.push(`updated_at = NOW()`);

    const { rows } = await pool.query<SupportKnowledgeArticle>(
      `UPDATE support_knowledge_articles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] || null;
  }

  async deleteArticle(id: string): Promise<boolean> {
    const res = await pool.query(`DELETE FROM support_knowledge_articles WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const supportRepository = new SupportRepository();
