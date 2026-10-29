import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/chat/chat.repository.js');
vi.mock('@/modules/s3/s3.service.js');
vi.mock('@/modules/notifications/notification.service.js');
vi.mock('@/socket/index.js');
vi.mock('@/socket/presenceManager.js');

import * as chatRepo from '@/modules/chat/chat.repository.js';
import { chatService } from '@/modules/chat/chat.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_USER_ID = '33333333-3333-4333-8333-333333333333';
const ORIGINAL_MSG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Chat Reply Feature Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(s3Service.uploadBuffer).mockResolvedValue({
      fileUrl: 'https://s3.amazonaws.com/test-bucket/file',
      key: 'test-key',
    });
    vi.mocked(s3Service.getReadUrl).mockImplementation(async key => `https://signed.s3.com/${key}`);
  });

  it('preserves reply_to_message_id and reply_to preview in getMessages', async () => {
    vi.spyOn(chatService, 'authorizeConversation').mockResolvedValue({
      conversation: {
        id: CONVERSATION_ID,
        doctor_id: DOCTOR_USER_ID,
        patient_id: PATIENT_USER_ID,
        status: 'ACTIVE',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        unread_count: 0,
      },
      senderType: 'DOCTOR',
    });

    vi.mocked(chatRepo.getMessagesByConversation).mockResolvedValue([
      {
        id: 'reply-msg-1',
        conversation_id: CONVERSATION_ID,
        sender_id: DOCTOR_USER_ID,
        sender_type: 'DOCTOR',
        message_type: 'TEXT',
        message: 'Please take this medication after food.',
        status: 'SENT',
        sent_at: '2026-10-16T12:05:00Z',
        created_at: '2026-10-16T12:05:00Z',
        updated_at: '2026-10-16T12:05:00Z',
        reply_to_message_id: ORIGINAL_MSG_ID,
        reply_to: {
          id: ORIGINAL_MSG_ID,
          sender_type: 'PATIENT',
          sender_id: PATIENT_USER_ID,
          sender_name: 'Patient John',
          message: 'When should I take the tablet?',
          message_type: 'TEXT',
          is_deleted: false,
        },
      },
    ]);

    const messages = await chatService.getMessages(CONVERSATION_ID, DOCTOR_USER_ID, 'doctor');

    expect(messages).toHaveLength(1);
    expect(messages[0]!.reply_to_message_id).toBe(ORIGINAL_MSG_ID);
    expect(messages[0]!.reply_to).toBeDefined();
    expect(messages[0]!.reply_to?.sender_name).toBe('Patient John');
    expect(messages[0]!.reply_to?.message).toBe('When should I take the tablet?');
    expect(messages[0]!.reply_to?.is_deleted).toBe(false);
  });

  it('handles deleted/unavailable original message gracefully with is_deleted flag', async () => {
    vi.spyOn(chatService, 'authorizeConversation').mockResolvedValue({
      conversation: {
        id: CONVERSATION_ID,
        doctor_id: DOCTOR_USER_ID,
        patient_id: PATIENT_USER_ID,
        status: 'ACTIVE',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        unread_count: 0,
      },
      senderType: 'DOCTOR',
    });

    vi.mocked(chatRepo.getMessagesByConversation).mockResolvedValue([
      {
        id: 'reply-msg-2',
        conversation_id: CONVERSATION_ID,
        sender_id: DOCTOR_USER_ID,
        sender_type: 'DOCTOR',
        message_type: 'TEXT',
        message: 'Understood.',
        status: 'SENT',
        sent_at: '2026-10-16T12:10:00Z',
        created_at: '2026-10-16T12:10:00Z',
        updated_at: '2026-10-16T12:10:00Z',
        reply_to_message_id: 'deleted-msg-id',
        reply_to: {
          id: 'deleted-msg-id',
          is_deleted: true,
          isDeleted: true,
        },
      },
    ]);

    const messages = await chatService.getMessages(CONVERSATION_ID, DOCTOR_USER_ID, 'doctor');

    expect(messages).toHaveLength(1);
    expect(messages[0]!.reply_to_message_id).toBe('deleted-msg-id');
    expect(messages[0]!.reply_to?.is_deleted).toBe(true);
  });

  it('supports replies to image and PDF attachments when uploading an attachment', async () => {
    vi.spyOn(chatService, 'authorizeConversation').mockResolvedValue({
      conversation: {
        id: CONVERSATION_ID,
        doctor_id: DOCTOR_USER_ID,
        patient_id: PATIENT_USER_ID,
        status: 'ACTIVE',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        unread_count: 0,
      },
      senderType: 'DOCTOR',
    });
    vi.spyOn(chatService, 'getRecipientUserId').mockResolvedValue(PATIENT_USER_ID);

    vi.mocked(chatRepo.saveMessage).mockResolvedValue({
      id: 'reply-att-1',
      conversation_id: CONVERSATION_ID,
      sender_id: DOCTOR_USER_ID,
      sender_type: 'DOCTOR',
      message_type: 'IMAGE',
      message: 'Here is the revised scan.',
      status: 'SENT',
      sent_at: '2026-10-16T12:15:00Z',
      created_at: '2026-10-16T12:15:00Z',
      updated_at: '2026-10-16T12:15:00Z',
      attachment_url: 'https://signed.s3.com/chat/scan.jpg',
      attachment_name: 'scan.jpg',
      attachment_type: 'image/jpeg',
      attachment_size: 1024 * 200,
      storage_key: 'chat/scan.jpg',
      reply_to_message_id: ORIGINAL_MSG_ID,
      reply_to: {
        id: ORIGINAL_MSG_ID,
        sender_type: 'PATIENT',
        sender_id: PATIENT_USER_ID,
        sender_name: 'Patient John',
        message: 'report.pdf',
        message_type: 'PDF',
        attachment_name: 'report.pdf',
        is_deleted: false,
      },
    });

    const file = {
      buffer: Buffer.from('fake-image-bytes'),
      fileName: 'scan.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 200,
    };

    const result = await chatService.uploadAttachment(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      file,
      'Here is the revised scan.',
      ORIGINAL_MSG_ID,
    );

    expect(chatRepo.saveMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'DOCTOR',
      'Here is the revised scan.',
      'IMAGE',
      expect.objectContaining({
        attachmentName: 'scan.jpg',
      }),
      ORIGINAL_MSG_ID,
    );
    expect(result.reply_to_message_id).toBe(ORIGINAL_MSG_ID);
    expect(result.reply_to?.attachment_name).toBe('report.pdf');
  });
});
