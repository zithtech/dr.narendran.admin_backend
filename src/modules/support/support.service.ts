import { pool } from '@/db/pool.js';
import { ForbiddenError, NotFoundError, ValidationError } from '@/http/errors.js';
import { logger } from '@/lib/logger.js';
import { notificationService } from '@/modules/notifications/notification.service.js';

import { supportAIService } from './support.ai.service.js';
import { supportRepository } from './support.repository.js';
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

export interface FAQItem {
  id: string;
  category: 'appointments' | 'availability' | 'prescriptions' | 'chat' | 'general';
  question: string;
  answer: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  emergencyPhone: string;
  whatsapp: string;
  address: string;
  operatingHours: string;
  responseTime: string;
  googleMapsUrl: string;
}

export interface AboutInfo {
  appName: string;
  portalName: string;
  version: string;
  build: string;
  releaseDate: string;
  environment: string;
  provider: {
    facilityName: string;
    leadConsultant: string;
    registrationNumber: string;
    accreditations: string[];
    address: string;
    officialPortalUrl: string;
  };
  compliance: {
    standards: string[];
    dpoContact: string;
    medicalRetentionPeriod: string;
  };
  licenses: Array<{ name: string; license: string }>;
}

export interface ExternalLinkInfo {
  id: string;
  title: string;
  url: string;
  category: 'portal' | 'support' | 'legal' | 'maps';
  description: string;
}

const DEFAULT_FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'appointments',
    question: 'How do I reschedule an appointment?',
    answer:
      'Go to your appointments list, tap on an upcoming appointment, and select Reschedule. You can then pick a new date and time slot for the patient.',
  },
  {
    id: 'faq-2',
    category: 'availability',
    question: 'How do I change my location availability?',
    answer:
      'Open your Profile or Schedule screen and tap Availability. From there, you can configure working hours, break times, and toggle active days for each clinic location.',
  },
  {
    id: 'faq-3',
    category: 'chat',
    question: 'How can I contact a patient directly?',
    answer:
      'You can use the Chat tab in the bottom navigation bar to message your booked patients directly, or tap their phone number on the appointment details screen.',
  },
  {
    id: 'faq-4',
    category: 'prescriptions',
    question: 'How do I issue an e-prescription?',
    answer:
      'During or after a consultation, open the appointment card and tap "Add Prescription". Enter the diagnosis, prescribed medicines, dosages, and instructions, then tap Save.',
  },
  {
    id: 'faq-5',
    category: 'appointments',
    question: 'How do I mark an appointment as complete?',
    answer:
      'On your Schedule screen, locate the patient card and tap "Complete Consultation". You can optionally attach consultation notes.',
  },
  {
    id: 'faq-6',
    category: 'availability',
    question: 'What happens if I need to block a specific date or holiday?',
    answer:
      'Under Availability > Blocked Dates, tap "+ Add Blocked Date" to mark specific days off. Patients will not be able to book appointments during blocked periods.',
  },
  {
    id: 'faq-7',
    category: 'general',
    question: 'How do I report an issue or bug in the app?',
    answer:
      'Go to Help & Support > Report an Issue, enter the subject and describe the issue in detail. A support ticket will automatically be created.',
  },
];
export class SupportService {
  // ── Backward-Compatible Legacy Methods ─────────────────────────────────────
  getFAQs(category?: string): FAQItem[] {
    if (category) {
      return DEFAULT_FAQS.filter(
        faq => faq.category.toLowerCase() === category.toLowerCase(),
      );
    }
    return DEFAULT_FAQS;
  }

  getContactInfo(): ContactInfo {
    return {
      email: 'support@drnarendran.com',
      phone: '+91 91509 55655',
      emergencyPhone: '+91 91509 55655',
      whatsapp: '+919150955655',
      address: '124, 4th Avenue, Shanthi Colony, Anna Nagar, Chennai - 600040',
      operatingHours: '24/7 Round-the-Clock Support',
      responseTime: 'Under 15 minutes for clinical queries',
      googleMapsUrl:
        'https://www.google.com/maps/search/?api=1&query=Dr.+Narendran+Healthcare+Centre+Anna+Nagar+Chennai',
    };
  }

  getAboutInfo(): AboutInfo {
    return {
      appName: 'Dr. Narendran HMS',
      portalName: 'Doctor Portal',
      version: '1.0.0',
      build: '2026.10.22',
      releaseDate: 'October 2026',
      environment: process.env['NODE_ENV'] || 'development',
      provider: {
        facilityName: 'Dr. Narendran Super Speciality Healthcare Centre',
        leadConsultant: 'Dr. Narendran MBBS, MD (General Medicine)',
        registrationNumber: 'TN-MCI-2018-84920',
        accreditations: [
          'NABH Accredited Hospital',
          'ISO 9001:2015 Quality Management Certified',
        ],
        address: '124, 4th Avenue, Shanthi Colony, Anna Nagar, Chennai - 600040',
        officialPortalUrl: 'https://drnarendran.com',
      },
      compliance: {
        standards: ['DISHA', 'ABDM', 'HIPAA Clinical Security', 'NMC Guidelines'],
        dpoContact: 'dpo@drnarendran.com',
        medicalRetentionPeriod: '3 years minimum statutory retention for clinical notes',
      },
      licenses: [
        { name: 'React Native', license: 'MIT License (Meta Platforms, Inc.)' },
        { name: 'Express.js', license: 'MIT License' },
        { name: 'PostgreSQL', license: 'PostgreSQL License' },
        { name: 'Socket.IO', license: 'MIT License' },
        { name: 'Zod & TypeScript', license: 'MIT License' },
      ],
    };
  }

  getSystemLinks(): ExternalLinkInfo[] {
    return [
      {
        id: 'portal',
        title: 'Official Healthcare Portal',
        url: 'https://drnarendran.com',
        category: 'portal',
        description: 'Web portal for hospital operations, consultations, and records',
      },
      {
        id: 'maps',
        title: 'Hospital Navigation (Google Maps)',
        url: 'https://www.google.com/maps/search/?api=1&query=Dr.+Narendran+Healthcare+Centre+Anna+Nagar+Chennai',
        category: 'maps',
        description: 'Physical location of Dr. Narendran Healthcare Centre in Anna Nagar, Chennai',
      },
      {
        id: 'whatsapp',
        title: 'Instant WhatsApp Desk',
        url: 'https://api.whatsapp.com/send?phone=919150955655',
        category: 'support',
        description: 'Direct messaging coordination desk with hospital staff',
      },
      {
        id: 'privacy',
        title: 'Privacy and Data Protection Policy',
        url: 'https://drnarendran.com/privacy',
        category: 'legal',
        description: 'Healthcare compliance and patient data privacy documentation',
      },
      {
        id: 'terms',
        title: 'Clinical Terms of Service',
        url: 'https://drnarendran.com/terms',
        category: 'legal',
        description: 'Terms governing medical consultation and portal usage',
      },
    ];
  }

  /* ---------------- User App Preferences ---------------- */

  async getUserPreferences(userId: string): Promise<Record<string, any>> {
    const { rows } = await pool.query(
      'SELECT preferences FROM user_preferences WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.preferences || {};
  }

  async saveUserPreferences(
    userId: string,
    preferences: Record<string, any>,
  ): Promise<Record<string, any>> {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET preferences = $2, updated_at = NOW()
       RETURNING preferences`,
      [userId, JSON.stringify(preferences)],
    );
    return rows[0]?.preferences || {};
  }

  async resetUserPreferences(userId: string): Promise<Record<string, any>> {
    await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
    return {};
  }

  /* ---------------- Privacy & Data Concerns ---------------- */

  async raisePrivacyConcern(
    userId: string,
    userType: string,
    category: string,
    details: string,
    subject?: string,
  ) {
    const trackingId = `DPO-${Math.floor(100000 + Math.random() * 900000)}`;
    const finalSubject = subject || `[PRIVACY_CONCERN] ${category}`;

    // 1. Record in privacy_requests
    const { rows: privacyRows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, category, subject, details, status)
       VALUES ($1, $2, $3, 'PRIVACY_CONCERN', $4, $5, $6, 'IN_REVIEW')
       RETURNING *`,
      [trackingId, userId, userType, category, finalSubject, details],
    );

    // 2. Also create a linked high-priority support ticket
    await pool.query(
      `INSERT INTO support_tickets (user_id, user_type, subject, message, status)
       VALUES ($1, $2, $3, $4, 'OPEN')`,
      [
        userId,
        userType,
        `[PRIORITY: HIGH] ${finalSubject} (${trackingId})`,
        `Incident Category: ${category}\nTracking ID: ${trackingId}\n\nIncident Details:\n${details}`,
      ],
    );

    return {
      trackingId,
      request: privacyRows[0],
      message: 'Your privacy concern has been officially logged with the Hospital Data Protection Officer.',
    };
  }

  async requestDataExport(
    userId: string,
    userType: string,
    format: string = 'PDF',
    details?: string,
  ) {
    const trackingId = `EXP-${Math.floor(100000 + Math.random() * 900000)}`;

    const { rows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, format, details, status)
       VALUES ($1, $2, $3, 'DATA_EXPORT', $4, $5, 'PROCESSING')
       RETURNING *`,
      [
        trackingId,
        userId,
        userType,
        format.toUpperCase(),
        details || `Export request for clinical notes, appointments and audit history in ${format.toUpperCase()}`,
      ],
    );

    return {
      trackingId,
      request: rows[0],
      estimatedHours: 2,
      message: `Your clinical data export (${format.toUpperCase()}) has been queued. A secure archive link will be delivered within 2-4 hours.`,
    };
  }

  async requestDataErasure(userId: string, userType: string, reason?: string) {
    const trackingId = `DEL-${Math.floor(100000 + Math.random() * 900000)}`;

    const { rows } = await pool.query(
      `INSERT INTO privacy_requests (request_id, user_id, user_type, request_type, details, status)
       VALUES ($1, $2, $3, 'DATA_ERASURE', $4, 'IN_REVIEW')
       RETURNING *`,
      [
        trackingId,
        userId,
        userType,
        reason || 'Request for account decommissioning and erasure of non-statutory records',
      ],
    );

    return {
      trackingId,
      request: rows[0],
      statutoryNote:
        'Clinical consultation records and audit trails are preserved for statutory minimum durations (3 years) as mandated by NMC and ABDM regulations.',
      message: 'Account erasure request submitted. An identity confirmation verification will occur before archival.',
    };
  }

  async getPrivacyRequests(userId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM privacy_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }

  /* ---------------- Support Tickets & Legal ---------------- */

  async getSupportTickets(userId: string) {
    return supportRepository.findTicketsByUserId(userId);
  }

  async getSupportTicketById(ticketId: string, userId?: string) {
    const query = userId
      ? 'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2'
      : 'SELECT * FROM support_tickets WHERE id = $1';
    const params = userId ? [ticketId, userId] : [ticketId];
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
  }

  async getLegalDocument(type: 'TERMS' | 'PRIVACY') {
    const { rows } = await pool.query(
      'SELECT content FROM legal_documents WHERE type = $1',
      [type],
    );
    return rows[0] || null;
  }

  async updateLegalDocument(type: 'TERMS' | 'PRIVACY', content: string) {
    const { rows } = await pool.query(
      `INSERT INTO legal_documents (type, content) 
       VALUES ($1, $2)
       ON CONFLICT (type) DO UPDATE SET content = $2, updated_at = NOW()
       RETURNING *`,
      [type, content],
    );
    return rows[0];
  }

  async createSupportTicket(userId: string, userType: string, subject: string, message: string) {
    return this.createTicket(userId, userType, { subject, message });
  }

  // ── Patient Ticket Operations ──────────────────────────────────────────────

  async createTicket(
    userId: string,
    userType: string,
    data: {
      subject: string;
      message?: string | undefined;
      description?: string | undefined;
      category?: string | undefined;
      priority?: TicketPriority | undefined;
      relatedEntityType?: string | null | undefined;
      relatedEntityId?: string | null | undefined;
      aiConversationId?: string | null | undefined;
    },
  ): Promise<SupportTicket> {
    const finalMessage = data.message || data.description || '';

    const ticket = await supportRepository.createTicket({
      userId,
      userType,
      subject: data.subject,
      message: finalMessage,
      category: data.category,
      priority: data.priority,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      aiConversationId: data.aiConversationId,
    });

    // Initial message in thread
    await supportRepository.createTicketMessage({
      ticketId: ticket.id,
      senderType: 'PATIENT',
      senderId: userId,
      senderName: 'Patient',
      messageType: 'MESSAGE',
      message: finalMessage,
    });

    // Link AI conversation if provided
    if (data.aiConversationId) {
      await supportRepository.linkAiConversationToTicket(data.aiConversationId, ticket.id);
    }

    // Record audit log
    await supportRepository.createAuditLog({
      ticketId: ticket.id,
      actorId: userId,
      action: 'CREATED',
      newValue: {
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
        category: ticket.category,
      },
    });

    // Dispatch in-app notification to patient
    void Promise.resolve(
      notificationService?.sendToUser(
        userId,
        {
          type: 'SUPPORT_TICKET_UPDATE',
          title: `Ticket Created (${ticket.ticket_number})`,
          body: `We have received your support request: "${ticket.subject.slice(0, 50)}". Our clinic care team will respond shortly.`,
          data: {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
          },
        },
        { saveInApp: true, appType: 'PATIENT' },
      ),
    ).catch(err => logger.warn({ err, ticketId: ticket.id }, 'Failed to dispatch ticket creation notification'));

    return ticket;
  }

  async getPatientTickets(userId: string): Promise<SupportTicket[]> {
    return supportRepository.findTicketsByUserId(userId);
  }

  async getPatientTicketDetails(
    ticketId: string,
    userId: string,
  ): Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> {
    const ticket = await supportRepository.findTicketById(ticketId, userId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found or access denied');
    }

    // Strictly exclude internal staff notes for patient view!
    const messages = await supportRepository.findMessagesByTicketId(ticketId, false);
    return { ticket, messages };
  }

  async addPatientMessage(
    ticketId: string,
    userId: string,
    message: string,
  ): Promise<SupportTicketMessage> {
    const ticket = await supportRepository.findTicketById(ticketId, userId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found or access denied');
    }

    if (ticket.status === 'CLOSED') {
      throw new ValidationError('Cannot reply to a closed ticket.');
    }

    const newMessage = await supportRepository.createTicketMessage({
      ticketId,
      senderType: 'PATIENT',
      senderId: userId,
      senderName: 'Patient',
      messageType: 'MESSAGE',
      message,
    });

    // If ticket was waiting for patient or resolved, transition back to IN_PROGRESS
    if (ticket.status === 'WAITING_FOR_PATIENT' || ticket.status === 'RESOLVED') {
      await supportRepository.updateTicket(ticketId, { status: 'IN_PROGRESS' });
      await supportRepository.createAuditLog({
        ticketId,
        actorId: userId,
        action: 'STATUS_CHANGED',
        oldValue: { status: ticket.status },
        newValue: { status: 'IN_PROGRESS', reason: 'Patient reply received' },
      });
    }

    return newMessage;
  }

  async reopenTicket(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await supportRepository.findTicketById(ticketId, userId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found or access denied');
    }

    if (ticket.status !== 'RESOLVED') {
      throw new ValidationError('Only resolved tickets can be reopened.');
    }

    const updated = await supportRepository.updateTicket(ticketId, {
      status: 'OPEN',
      resolvedAt: null,
    });

    await supportRepository.createTicketMessage({
      ticketId,
      senderType: 'SYSTEM',
      senderName: 'System',
      messageType: 'SYSTEM_EVENT',
      message: 'Ticket reopened by patient.',
    });

    await supportRepository.createAuditLog({
      ticketId,
      actorId: userId,
      action: 'REOPENED',
      oldValue: { status: 'RESOLVED' },
      newValue: { status: 'OPEN' },
    });

    return updated!;
  }

  // ── AI Conversational Support ──────────────────────────────────────────────

  async startAiConversation(
    userId: string,
    contextType?: string | null,
    contextEntityId?: string | null,
  ) {
    return supportRepository.createAiConversation({
      userId,
      contextType: contextType || undefined,
      contextEntityId: contextEntityId || undefined,
    });
  }

  async getAiConversation(conversationId: string, userId: string) {
    const conv = await supportRepository.findAiConversationById(conversationId, userId);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }
    const messages = await supportRepository.findAiMessagesByConversationId(conversationId);
    return { conversation: conv, messages };
  }

  async sendAiMessage(
    userId: string,
    conversationId: string,
    messageText: string,
  ) {
    const conv = await supportRepository.findAiConversationById(conversationId, userId);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }

    // 1. Record patient turn
    await supportRepository.createAiMessage({
      conversationId,
      senderType: 'PATIENT',
      message: messageText,
    });

    // 2. Process with AI Service
    const aiResponse = await supportAIService.processPatientMessage(
      userId,
      messageText,
      conv.context_type,
      conv.context_entity_id,
    );

    // 3. Record assistant turn
    const sourceIds = aiResponse.relatedArticles.map(a => a.id);
    const assistantMessage = await supportRepository.createAiMessage({
      conversationId,
      senderType: 'ASSISTANT',
      message: aiResponse.answer,
      sourceArticleIds: sourceIds,
      suggestedActions: aiResponse.suggestedActions,
    });

    return {
      messageId: assistantMessage.id,
      conversationId,
      answer: aiResponse.answer,
      reply: aiResponse.answer,
      suggestedQuestions: aiResponse.suggestedQuestions,
      suggestedActions: aiResponse.suggestedActions,
      relatedArticles: aiResponse.relatedArticles,
      requiresHumanSupport: aiResponse.requiresHumanSupport,
      suggestedCategory: aiResponse.suggestedCategory,
      createdAt: assistantMessage.created_at,
    };
  }

  // ── Admin Workspace Operations ─────────────────────────────────────────────

  async getAdminTickets(filters: {
    status?: string | undefined;
    category?: string | undefined;
    priority?: string | undefined;
    assignedTo?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }) {
    return supportRepository.listTicketsForAdmin({
      status: filters.status,
      category: filters.category,
      priority: filters.priority,
      assignedTo: filters.assignedTo,
      search: filters.search,
      page: filters.page,
      limit: filters.limit,
    });
  }

  async getAdminTicketDetails(ticketId: string): Promise<{
    ticket: SupportTicket;
    messages: SupportTicketMessage[];
    auditLogs: SupportTicketAuditLog[];
    aiConversation?: unknown;
  }> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Admins see all messages including internal staff notes
    const messages = await supportRepository.findMessagesByTicketId(ticketId, true);
    const auditLogs = await supportRepository.findAuditLogsByTicketId(ticketId);

    let aiConversation = null;
    if (ticket.ai_conversation_id) {
      const conv = await supportRepository.findAiConversationById(ticket.ai_conversation_id);
      if (conv) {
        const aiMsgs = await supportRepository.findAiMessagesByConversationId(conv.id);
        aiConversation = { ...conv, messages: aiMsgs };
      }
    }

    return { ticket, messages, auditLogs, aiConversation };
  }

  async updateTicketProperties(
    ticketId: string,
    adminId: string,
    updates: {
      status?: TicketStatus | undefined;
      priority?: TicketPriority | undefined;
      category?: string | undefined;
      assignedTo?: string | null | undefined;
      resolutionNotes?: string | null | undefined;
    },
  ): Promise<SupportTicket> {
    const existing = await supportRepository.findTicketById(ticketId);
    if (!existing) {
      throw new NotFoundError('Ticket not found');
    }

    // Validate assignedTo if provided
    if (updates.assignedTo !== undefined && updates.assignedTo !== null) {
      const agent = await supportRepository.findAdminUserById(updates.assignedTo);
      if (agent?.status !== 'ACTIVE') {
        throw new ValidationError('Selected support agent does not exist or is inactive.');
      }
    }

    const resolvedAt = updates.status === 'RESOLVED' ? new Date() : (updates.status ? null : undefined);
    const closedAt = updates.status === 'CLOSED' ? new Date() : (updates.status ? null : undefined);

    const updated = await supportRepository.updateTicket(ticketId, {
      status: updates.status,
      priority: updates.priority,
      category: updates.category,
      assignedTo: updates.assignedTo,
      resolutionNotes: updates.resolutionNotes,
      resolvedAt: resolvedAt !== undefined ? resolvedAt : undefined,
      closedAt: closedAt !== undefined ? closedAt : undefined,
    });

    // Record audit log
    await supportRepository.createAuditLog({
      ticketId,
      actorId: adminId,
      action: 'PROPERTIES_UPDATED',
      oldValue: {
        status: existing.status,
        priority: existing.priority,
        category: existing.category,
        assigned_to: existing.assigned_to,
      },
      newValue: {
        status: updated?.status,
        priority: updated?.priority,
        category: updated?.category,
        assigned_to: updated?.assigned_to,
      },
    });

    // Notify patient if resolved or closed
    if (updates.status === 'RESOLVED' && existing.status !== 'RESOLVED') {
      void Promise.resolve(
        notificationService?.sendToUser(
          existing.user_id,
          {
            type: 'SUPPORT_TICKET_UPDATE',
            title: `Ticket Resolved (${existing.ticket_number})`,
            body: `Your support ticket has been resolved by clinic staff: "${existing.subject}". Tap to review resolution.`,
            data: {
              ticketId: existing.id,
              ticketNumber: existing.ticket_number,
              status: 'RESOLVED',
            },
          },
          { saveInApp: true, appType: 'PATIENT' },
        ),
      ).catch(err => logger.warn({ err }, 'Failed to send resolution notification'));
    }

    return updated!;
  }

  async assignTicket(ticketId: string, adminId: string, assignedTo: string | null): Promise<SupportTicket> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    let agentName = 'Unassigned';
    if (assignedTo) {
      const agent = await supportRepository.findAdminUserById(assignedTo);
      if (!agent) {
        throw new ValidationError('Selected support agent does not exist.');
      }
      if (agent.status !== 'ACTIVE') {
        throw new ValidationError('Cannot assign ticket to an inactive agent account.');
      }
      agentName = agent.name || agent.username;
    }

    const updated = await supportRepository.updateTicket(ticketId, {
      assignedTo,
    });

    await supportRepository.createTicketMessage({
      ticketId,
      senderType: 'SYSTEM',
      senderName: 'System',
      messageType: 'SYSTEM_EVENT',
      message: `Ticket assigned to ${agentName}.`,
    });

    await supportRepository.createAuditLog({
      ticketId,
      actorId: adminId,
      action: 'ASSIGNED',
      oldValue: { assigned_to: ticket.assigned_to },
      newValue: { assigned_to: assignedTo, agent_name: agentName },
    });

    return updated!;
  }

  async addAdminReply(
    ticketId: string,
    adminId: string,
    adminName: string,
    message: string,
    statusChange?: TicketStatus,
  ): Promise<SupportTicketMessage> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    const newMsg = await supportRepository.createTicketMessage({
      ticketId,
      senderType: 'SUPPORT_AGENT',
      senderId: adminId,
      senderName: adminName,
      messageType: 'MESSAGE',
      message,
    });

    if (statusChange) {
      await supportRepository.updateTicket(ticketId, {
        status: statusChange,
        resolvedAt: statusChange === 'RESOLVED' ? new Date() : (statusChange ? null : undefined),
        closedAt: statusChange === 'CLOSED' ? new Date() : (statusChange ? null : undefined),
      });

      await supportRepository.createAuditLog({
        ticketId,
        actorId: adminId,
        action: 'STATUS_CHANGED',
        oldValue: { status: ticket.status },
        newValue: { status: statusChange },
      });
    }

    // Dispatch notification to patient
    void Promise.resolve(
      notificationService?.sendToUser(
        ticket.user_id,
        {
          type: 'SUPPORT_TICKET_UPDATE',
          title: `Support Reply (${ticket.ticket_number})`,
          body: `Dr. Narendran Clinic Support replied: "${message.slice(0, 80)}"`,
          data: {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
          },
        },
        { saveInApp: true, appType: 'PATIENT' },
      ),
    ).catch(err => logger.warn({ err }, 'Failed to dispatch reply notification'));

    return newMsg;
  }

  async addInternalNote(
    ticketId: string,
    adminId: string,
    adminName: string,
    note: string,
  ): Promise<SupportTicketMessage> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    const newNote = await supportRepository.createTicketMessage({
      ticketId,
      senderType: 'SUPPORT_AGENT',
      senderId: adminId,
      senderName: adminName,
      messageType: 'INTERNAL_NOTE',
      message: note,
    });

    await supportRepository.createAuditLog({
      ticketId,
      actorId: adminId,
      action: 'NOTE_ADDED',
      newValue: { note_preview: note.slice(0, 60) },
    });

    return newNote;
  }

  async generateAiSummary(ticketId: string) {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    let aiMessages: { sender_type: string; message: string }[] = [];
    if (ticket.ai_conversation_id) {
      const conv = await supportRepository.findAiConversationById(ticket.ai_conversation_id);
      if (conv) {
        const msgs = await supportRepository.findAiMessagesByConversationId(conv.id);
        aiMessages = msgs.map(m => ({ sender_type: m.sender_type, message: m.message }));
      }
    }

    return supportAIService.generateTicketSummary(
      ticket.subject,
      ticket.message,
      aiMessages,
    );
  }

  async getAdminMetrics(): Promise<SupportMetrics> {
    return supportRepository.getSupportMetrics();
  }

  async getActiveAgents(): Promise<SupportAgent[]> {
    return supportRepository.listActiveSupportAgents();
  }

  // ── Knowledge Base Management ──────────────────────────────────────────────

  getCategories() {
    return [
      { id: 'APPOINTMENTS', title: 'Appointments & Rescheduling', icon: 'calendar', count: 2 },
      { id: 'PRESCRIPTIONS', title: 'Prescriptions & Medical Records', icon: 'file-text', count: 1 },
      { id: 'PHARMACY_ORDERS', title: 'Pharmacy & Medicine Orders', icon: 'pill', count: 2 },
      { id: 'PAYMENTS_BILLING', title: 'Payments, Refunds & Billing', icon: 'credit-card', count: 1 },
      { id: 'ACCOUNT_LOGIN', title: 'Account, Login & Profile', icon: 'user', count: 1 },
      { id: 'TECHNICAL_ISSUES', title: 'Technical & App Settings', icon: 'settings', count: 1 },
      { id: 'GENERAL_QUERY', title: 'General Clinic Inquiries', icon: 'help-circle', count: 0 },
    ];
  }

  async getPublishedArticles(category?: string, query?: string): Promise<SupportKnowledgeArticle[]> {
    return supportRepository.listPublishedArticles(category, query);
  }

  async getArticleDetail(idOrSlug: string): Promise<SupportKnowledgeArticle> {
    const article = await supportRepository.findArticleByIdOrSlug(idOrSlug);
    if (!article) {
      throw new NotFoundError('Article');
    }
    return article;
  }

  async submitArticleFeedback(articleId: string, userId: string, isHelpful: boolean) {
    const article = await supportRepository.findArticleByIdOrSlug(articleId);
    if (!article) {
      throw new NotFoundError('Article');
    }
    return supportRepository.recordArticleFeedback(article.id, userId, isHelpful);
  }

  async getAllArticlesAdmin(): Promise<SupportKnowledgeArticle[]> {
    return supportRepository.listAllArticlesForAdmin();
  }

  async createArticle(adminId: string, data: {
    title: string;
    slug?: string | undefined;
    category: string;
    content: string;
    keywords?: string[] | undefined;
    isFaq?: boolean | undefined;
    status?: string | undefined;
  }): Promise<SupportKnowledgeArticle> {
    return supportRepository.createArticle({ ...data, createdBy: adminId });
  }

  async updateArticle(adminId: string, id: string, data: {
    title?: string | undefined;
    slug?: string | undefined;
    category?: string | undefined;
    content?: string | undefined;
    keywords?: string[] | undefined;
    isFaq?: boolean | undefined;
    status?: string | undefined;
  }): Promise<SupportKnowledgeArticle> {
    const existing = await supportRepository.findArticleByIdOrSlug(id);
    if (!existing) {
      throw new NotFoundError('Article');
    }
    const updated = await supportRepository.updateArticle(existing.id, {
      title: data.title,
      slug: data.slug,
      category: data.category,
      content: data.content,
      keywords: data.keywords,
      isFaq: data.isFaq,
      status: data.status,
      updatedBy: adminId,
    });
    return updated!;
  }

  async deleteArticle(id: string): Promise<{ success: boolean }> {
    const existing = await supportRepository.findArticleByIdOrSlug(id);
    if (!existing) {
      throw new NotFoundError('Article');
    }
    await supportRepository.deleteArticle(existing.id);
    return { success: true };
  }

  async updateSupportTicketStatus(ticketId: string, status: string) {
    const { rows } = await pool.query(
      `UPDATE support_tickets 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status.toUpperCase(), ticketId],
    );
    return rows[0] || null;
  }
}

export const supportService = new SupportService();
