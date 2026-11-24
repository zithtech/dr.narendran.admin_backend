export type SenderType = 'PATIENT' | 'DOCTOR';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';
export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'BLOCKED';

export interface ChatDoctor {
  id: string;
  user_account_id?: string | undefined;
  userAccountId?: string | undefined;
  name: string;
  specialization: string;
  specialty?: string | undefined;
  profile_image_url?: string | undefined;
  avatar_url?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  is_online: boolean;
  online_status: 'online' | 'offline';
  last_message?: string | undefined;
  last_message_at?: string | undefined;
  unread_count?: number | undefined;
}

export interface ChatRecipient {
  id: string;
  name: string;
  role: 'DOCTOR' | 'PATIENT' | 'ADMIN' | 'STAFF' | string;
  subtitle?: string | undefined;
  specialization?: string | undefined;
  specialty?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  avatar_url?: string | undefined;
  profile_image_url?: string | undefined;
  is_online?: boolean | undefined;
  online_status?: 'online' | 'offline' | undefined;
  unread_count?: number | undefined;
  last_message?: string | undefined;
  last_message_at?: string | undefined;
  user_account_id?: string | undefined;
  gender?: string | undefined;
  age?: number | string | undefined;
  status?: string | undefined;
}

export type RecipientCategory = 'doctors' | 'patients' | 'others';

export interface CategorizedRecipients {
  doctors?: ChatRecipient[] | undefined;
  patients?: ChatRecipient[] | undefined;
  others?: ChatRecipient[] | undefined;
}

export interface ChatConversation {
  id: string;
  conversation_id?: string | undefined;
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
  // Recipient / peer details for unified Web and Mobile UI
  recipient_id?: string | undefined;
  recipient_name?: string | undefined;
  recipient_avatar?: string | undefined;
  recipient_role?: string | undefined;
  other_participant_name?: string | undefined;
  name?: string | undefined;
  avatar_url?: string | undefined;
  is_online?: boolean | undefined;
  unread_count: number;
  unreadCount?: number | undefined;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  conversationId?: string | undefined;
  sender_id: string;
  senderId?: string | undefined;
  sender_role?: string | undefined;
  senderRole?: string | undefined;
  sender_type: SenderType;
  senderType?: SenderType | undefined;
  recipient_id?: string | undefined;
  recipientId?: string | undefined;
  message_type: string;
  messageType?: string | undefined;
  message: string;
  content?: string | undefined;
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
  doctorId?: string | undefined;
  patient_id?: string | undefined;
  patientId?: string | undefined;
  recipient_id?: string | undefined;
  recipientId?: string | undefined;
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
