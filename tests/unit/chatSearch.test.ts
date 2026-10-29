import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/chat/chat.repository.js');
vi.mock('@/modules/s3/s3.service.js');
vi.mock('@/modules/notifications/notification.service.js');
vi.mock('@/socket/index.js');
vi.mock('@/socket/presenceManager.js');

import { ForbiddenError } from '@/http/errors.js';
import * as chatRepo from '@/modules/chat/chat.repository.js';
import { chatService } from '@/modules/chat/chat.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_USER_ID = '33333333-3333-4333-8333-333333333333';
const UNAUTHORIZED_USER_ID = '99999999-9999-4999-8999-999999999999';

describe('Chat Search Feature Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(s3Service.getReadUrl).mockImplementation(async key => `https://signed.s3.com/${key}`);
  });

  it('searches messages in authorized conversation and returns matches', async () => {
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

    vi.mocked(chatRepo.searchMessagesInConversation).mockResolvedValue([
      {
        id: 'msg-1',
        conversation_id: CONVERSATION_ID,
        sender_id: PATIENT_USER_ID,
        sender_type: 'PATIENT',
        sender_name: 'Patient John',
        message_type: 'TEXT',
        message: 'I have severe fever and headache',
        status: 'READ',
        sent_at: '2026-10-16T10:00:00Z',
        created_at: '2026-10-16T10:00:00Z',
        updated_at: '2026-10-16T10:00:00Z',
      },
    ]);

    const results = await chatService.searchMessages(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      'fever',
      10,
      0,
    );

    expect(chatService.authorizeConversation).toHaveBeenCalledWith(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
    );
    expect(chatRepo.searchMessagesInConversation).toHaveBeenCalledWith(
      CONVERSATION_ID,
      'fever',
      10,
      0,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('msg-1');
    expect(results[0]!.message).toContain('fever');
    expect(results[0]!.sender_name).toBe('Patient John');
  });

  it('returns empty array when query is empty or whitespace without querying database', async () => {
    const results = await chatService.searchMessages(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      '   ',
    );

    expect(results).toEqual([]);
    expect(chatRepo.searchMessagesInConversation).not.toHaveBeenCalled();
  });

  it('enforces authorization and blocks search for unauthorized user', async () => {
    vi.spyOn(chatService, 'authorizeConversation').mockRejectedValue(
      new ForbiddenError('You are not a participant in this conversation'),
    );

    await expect(
      chatService.searchMessages(
        CONVERSATION_ID,
        UNAUTHORIZED_USER_ID,
        'doctor',
        'blood test',
      ),
    ).rejects.toThrow(ForbiddenError);

    expect(chatRepo.searchMessagesInConversation).not.toHaveBeenCalled();
  });

  it('dynamically signs attachment URLs for attachment matches with storage_key', async () => {
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

    vi.mocked(chatRepo.searchMessagesInConversation).mockResolvedValue([
      {
        id: 'msg-attach-1',
        conversation_id: CONVERSATION_ID,
        sender_id: DOCTOR_USER_ID,
        sender_type: 'DOCTOR',
        sender_name: 'Dr. Bharathi',
        message_type: 'PDF',
        message: 'Lab_Report.pdf',
        attachment_name: 'Lab_Report.pdf',
        attachment_type: 'application/pdf',
        attachment_size: 1024,
        storage_key: 'chats/lab_report.pdf',
        status: 'DELIVERED',
        sent_at: '2026-10-16T11:00:00Z',
        created_at: '2026-10-16T11:00:00Z',
        updated_at: '2026-10-16T11:00:00Z',
      },
    ]);

    const results = await chatService.searchMessages(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      'Lab_Report',
    );

    expect(results).toHaveLength(1);
    expect(s3Service.getReadUrl).toHaveBeenCalledWith('chats/lab_report.pdf', 86400);
    expect(results[0]!.attachment_url).toBe('https://signed.s3.com/chats/lab_report.pdf');
    expect(results[0]!.attachment_name).toBe('Lab_Report.pdf');
  });
});
