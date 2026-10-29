import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/chat/chat.repository.js');
vi.mock('@/modules/s3/s3.service.js');
vi.mock('@/modules/notifications/notification.service.js');
vi.mock('@/socket/index.js');
vi.mock('@/socket/presenceManager.js');

import { ForbiddenError, NotFoundError, ValidationError } from '@/http/errors.js';
import * as chatRepo from '@/modules/chat/chat.repository.js';
import { chatService } from '@/modules/chat/chat.service.js';
import { s3Service } from '@/modules/s3/s3.service.js';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_USER_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_USER_ID = '99999999-9999-4999-8999-999999999999';

describe('Chat Attachments Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(s3Service.uploadBuffer).mockResolvedValue({
      fileUrl: 'https://s3.amazonaws.com/test-bucket/file',
      key: 'test-key',
    });
    vi.mocked(s3Service.getReadUrl).mockImplementation(async key => `https://signed.s3.com/${key}`);
  });

  it('successfully uploads and stores an image attachment with signed URL', async () => {
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
      id: 'msg-img-1',
      conversation_id: CONVERSATION_ID,
      sender_id: DOCTOR_USER_ID,
      sender_type: 'DOCTOR',
      message_type: 'IMAGE',
      message: 'xray.jpg',
      status: 'SENT',
      sent_at: '2026-10-16T12:00:00Z',
      created_at: '2026-10-16T12:00:00Z',
      updated_at: '2026-10-16T12:00:00Z',
      attachment_url: 'https://signed.s3.com/chat/1111/xray.jpg',
      attachment_name: 'xray.jpg',
      attachment_type: 'image/jpeg',
      attachment_size: 1024 * 50,
      storage_key: 'chat/1111/xray.jpg',
    });

    const file = {
      buffer: Buffer.from('fake-image-bytes'),
      fileName: 'xray.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 50,
    };

    const result = await chatService.uploadAttachment(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      file,
      'Chest X-Ray',
    );

    expect(s3Service.uploadBuffer).toHaveBeenCalledWith(
      expect.stringContaining('xray.jpg'),
      file.buffer,
      'image/jpeg',
    );
    expect(chatRepo.saveMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'DOCTOR',
      'Chest X-Ray',
      'IMAGE',
      expect.objectContaining({
        attachmentName: 'xray.jpg',
        attachmentType: 'image/jpeg',
      }),
    );
    expect(result.attachment_url).toContain('https://signed.s3.com/');
    expect(result.message_type).toBe('IMAGE');
  });

  it('successfully uploads and stores a PDF document attachment', async () => {
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
      id: 'msg-pdf-1',
      conversation_id: CONVERSATION_ID,
      sender_id: DOCTOR_USER_ID,
      sender_type: 'DOCTOR',
      message_type: 'PDF',
      message: 'lab_report.pdf',
      status: 'SENT',
      sent_at: '2026-10-16T12:00:00Z',
      created_at: '2026-10-16T12:00:00Z',
      updated_at: '2026-10-16T12:00:00Z',
      attachment_url: 'https://signed.s3.com/chat/1111/lab_report.pdf',
      attachment_name: 'lab_report.pdf',
      attachment_type: 'application/pdf',
      attachment_size: 1024 * 200,
      storage_key: 'chat/1111/lab_report.pdf',
    });

    const file = {
      buffer: Buffer.from('%PDF-1.4 sample'),
      fileName: 'lab_report.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 200,
    };

    const result = await chatService.uploadAttachment(
      CONVERSATION_ID,
      DOCTOR_USER_ID,
      'doctor',
      file,
    );

    expect(s3Service.uploadBuffer).toHaveBeenCalledWith(
      expect.stringContaining('lab_report.pdf'),
      file.buffer,
      'application/pdf',
    );
    expect(result.message_type).toBe('PDF');
    expect(result.attachment_name).toBe('lab_report.pdf');
  });

  it('rejects files exceeding 15 MB limit with ValidationError', async () => {
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

    const hugeFile = {
      buffer: Buffer.alloc(10),
      fileName: 'huge.pdf',
      mimeType: 'application/pdf',
      fileSize: 16 * 1024 * 1024, // 16 MB
    };

    await expect(
      chatService.uploadAttachment(
        CONVERSATION_ID,
        DOCTOR_USER_ID,
        'doctor',
        hugeFile,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects unsupported file types (e.g. zip, exe) with ValidationError', async () => {
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

    const invalidFile = {
      buffer: Buffer.from('executable binary'),
      fileName: 'virus.exe',
      mimeType: 'application/x-msdownload',
      fileSize: 1024,
    };

    await expect(
      chatService.uploadAttachment(
        CONVERSATION_ID,
        DOCTOR_USER_ID,
        'doctor',
        invalidFile,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('enforces permissions and rejects unauthorized participant with ForbiddenError', async () => {
    vi.mocked(chatRepo.findConversationById).mockResolvedValue({
      id: CONVERSATION_ID,
      doctor_id: DOCTOR_USER_ID,
      patient_id: PATIENT_USER_ID,
      status: 'ACTIVE',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      unread_count: 0,
    });

    vi.spyOn(chatService, 'resolveUserIdentity').mockResolvedValue({
      doctorId: STRANGER_USER_ID,
      doctorIds: [STRANGER_USER_ID],
      userAccountId: STRANGER_USER_ID,
      senderType: 'DOCTOR',
      name: 'Dr. Stranger',
    });

    await expect(
      chatService.authorizeConversation(CONVERSATION_ID, STRANGER_USER_ID, 'doctor'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('returns fresh signed URL for authorized attachment retrieval', async () => {
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

    vi.mocked(chatRepo.findMessageById).mockResolvedValue({
      id: 'msg-pdf-1',
      conversation_id: CONVERSATION_ID,
      sender_id: DOCTOR_USER_ID,
      sender_type: 'DOCTOR',
      message_type: 'PDF',
      message: 'report.pdf',
      status: 'SENT',
      sent_at: '2026-10-16T12:00:00Z',
      created_at: '2026-10-16T12:00:00Z',
      updated_at: '2026-10-16T12:00:00Z',
      attachment_name: 'report.pdf',
      attachment_type: 'application/pdf',
      storage_key: 'chat/conv1/report.pdf',
    });

    const result = await chatService.getAttachmentSignedUrl(
      CONVERSATION_ID,
      'msg-pdf-1',
      DOCTOR_USER_ID,
      'doctor',
    );

    expect(result.downloadUrl).toBe('https://signed.s3.com/chat/conv1/report.pdf');
    expect(result.fileName).toBe('report.pdf');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('throws NotFoundError when accessing attachment for nonexistent message', async () => {
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

    vi.mocked(chatRepo.findMessageById).mockResolvedValue(null);

    await expect(
      chatService.getAttachmentSignedUrl(
        CONVERSATION_ID,
        'nonexistent-id',
        DOCTOR_USER_ID,
        'doctor',
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
