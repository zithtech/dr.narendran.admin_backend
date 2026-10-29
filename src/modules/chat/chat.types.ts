export type SenderType = 'PATIENT' | 'DOCTOR';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';
export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'BLOCKED';

export interface ChatDoctor {
  id: string;
  user_account_id?: string;
  userAccountId?: string;
  name: string;
  specialization: string;
  specialty?: string | undefined;
  profile_image_url?: string | undefined;
  avatar_url?: string | undefined;
  is_online: boolean;
  online_status: 'online' | 'offline';
  last_message?: string | undefined;
  last_message_at?: string | undefined;
  unread_count?: number | undefined;
}

export interface ChatConversation {
  id: string;
  conversation_id?: string;
  patient_id: string;
  doctor_id: string;
  status: ConversationStatus;
  last_message_id?: string | null | undefined;
  last_message_at?: string | null | undefined;
  last_message?: string | null | undefined;
  lastMessage?: string | null | undefined;
  lastMessageAt?: string | null | undefined;
  created_at: string;
  updated_at: string;
  doctor_name?: string | undefined;
  specialization?: string | undefined;
  doctor_avatar?: string | undefined;
  doctor_profile_image?: string | undefined;
  doctor_online?: boolean | undefined;
  patient_name?: string | undefined;
  patient_avatar?: string | undefined;
  patient_profile_image?: string | undefined;
  profile_image_url?: string | undefined;
  patient_online?: boolean | undefined;
  patient_phone?: string | undefined;
  unread_count: number;
  unreadCount?: number;
}


export interface ChatMessage {
  id: string;
  conversation_id: string;
  conversationId?: string | undefined;
  sender_id: string;
  senderId?: string | undefined;
  sender_type: SenderType;
  senderType?: SenderType | undefined;
  message_type: string;
  messageType?: string | undefined;
  message: string;
  status: MessageStatus;
  sent_at: string;
  sentAt?: string | undefined;
  delivered_at?: string | null | undefined;
  deliveredAt?: string | null | undefined;
  read_at?: string | null | undefined;
  readAt?: string | null | undefined;
  created_at: string;
  createdAt?: string | undefined;
  updated_at: string;
  updatedAt?: string | undefined;
  attachment_url?: string | null | undefined;
  attachmentUrl?: string | null | undefined;
  attachment_name?: string | null | undefined;
  attachmentName?: string | null | undefined;
  attachment_type?: string | null | undefined;
  attachmentType?: string | null | undefined;
  attachment_size?: number | null | undefined;
  attachmentSize?: number | null | undefined;
  storage_key?: string | null | undefined;
  storageKey?: string | null | undefined;
  reply_to_message_id?: string | null | undefined;
  replyToMessageId?: string | null | undefined;
  reply_to?: QuotedMessagePreview | null | undefined;
  replyTo?: QuotedMessagePreview | null | undefined;
  sender_name?: string | null | undefined;
  senderName?: string | null | undefined;
  is_deleted?: boolean | undefined;
  isDeleted?: boolean | undefined;
  deleted_at?: string | null | undefined;
  deletedAt?: string | null | undefined;
}

export interface QuotedMessagePreview {
  id: string;
  sender_type?: SenderType | undefined;
  senderType?: SenderType | undefined;
  sender_id?: string | undefined;
  senderId?: string | undefined;
  sender_name?: string | undefined;
  senderName?: string | undefined;
  message?: string | undefined;
  content?: string | undefined;
  message_type?: string | undefined;
  messageType?: string | undefined;
  attachment_url?: string | null | undefined;
  attachmentUrl?: string | null | undefined;
  attachment_name?: string | null | undefined;
  attachmentName?: string | null | undefined;
  attachment_type?: string | null | undefined;
  attachmentType?: string | null | undefined;
  is_deleted?: boolean | undefined;
  isDeleted?: boolean | undefined;
}

export interface CreateConversationInput {
  doctor_id?: string | undefined;
  patient_id?: string | undefined;
}

export interface SendMessageInput {
  conversation_id: string;
  sender_id: string;
  sender_type: SenderType;
  message: string;
  message_type?: string | undefined;
  attachment_url?: string | undefined;
  attachment_name?: string | undefined;
  attachment_type?: string | undefined;
  attachment_size?: number | undefined;
  storage_key?: string | undefined;
  reply_to_message_id?: string | null | undefined;
  replyToMessageId?: string | null | undefined;
}

export interface GetMessagesQuery {
  limit?: number | undefined;
  before?: string | undefined;
}
