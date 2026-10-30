export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_PATIENT'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketCategory =
  | 'APPOINTMENTS'
  | 'PRESCRIPTIONS'
  | 'PHARMACY_ORDERS'
  | 'PAYMENTS_BILLING'
  | 'ACCOUNT_LOGIN'
  | 'TECHNICAL_ISSUES'
  | 'GENERAL_QUERY';

export type MessageSenderType = 'PATIENT' | 'SUPPORT_AGENT' | 'SYSTEM';

export type MessageType = 'MESSAGE' | 'INTERNAL_NOTE' | 'SYSTEM_EVENT';

export type ConversationStatus = 'ACTIVE' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  user_type: string;
  subject: string;
  message: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  ai_conversation_id: string | null;
  resolution_notes: string | null;
  resolved_at: Date | string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  patient_name?: string | null;
  patient_email?: string | null;
  patient_phone?: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_username?: string | null;
  latest_message?: string | null;
  latest_message_at?: Date | string | null;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_type: MessageSenderType;
  sender_id: string | null;
  sender_name: string | null;
  message_type: MessageType;
  message: string;
  attachments?: unknown[] | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AISupportConversation {
  id: string;
  user_id: string;
  status: ConversationStatus;
  context_type: string | null;
  context_entity_id: string | null;
  linked_ticket_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AISupportMessage {
  id: string;
  conversation_id: string;
  sender_type: 'PATIENT' | 'ASSISTANT' | 'SYSTEM';
  message: string;
  source_article_ids: string[] | null;
  suggested_actions?: {
    id: string;
    title: string;
    type: 'NAVIGATE' | 'CREATE_TICKET' | 'OPEN_DIALER';
    payload?: Record<string, unknown>;
  }[] | null;
  created_at: Date | string;
}

export interface SupportKnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  category: TicketCategory;
  content: string;
  keywords: string[];
  is_faq: boolean;
  status: ArticleStatus;
  helpful_count: number;
  unhelpful_count: number;
  created_by: string | null;
  updated_by: string | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SupportTicketAuditLog {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: Date | string;
}

export interface SupportAgent {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
}

export interface SupportMetrics {
  totalOpenTickets: number;
  unassignedTickets: number;
  awaitingPatientResponse: number;
  inProgressTickets: number;
  resolvedToday: number;
  averageFirstResponseMinutes: number;
  averageResolutionHours: number;
}
