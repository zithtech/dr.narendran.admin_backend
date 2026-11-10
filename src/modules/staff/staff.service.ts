import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { NotFoundError } from '@/http/errors.js';
import { s3Service } from '@/modules/s3/s3.service.js';

import * as repo from './staff.repository.js';
import type {
  CreateStaffInput,
  StaffDocument,
  StaffFilterParams,
  StaffMember,
  StaffStatus,
  UpdateStaffInput,
} from './staff.types.js';

async function enrichStaffDocuments(staff: StaffMember): Promise<StaffMember> {
  if (!staff.documents || staff.documents.length === 0) return staff;

  const enrichedDocs = await Promise.all(
    staff.documents.map(async (doc) => {
      const viewEndpoint = `/api/staff/${staff.id}/documents/${doc.id}/view`;
      if (doc.storageKey) {
        try {
          const signedUrl = await s3Service.getReadUrl(decodeURIComponent(doc.storageKey), 86400);
          if (
            signedUrl &&
            signedUrl.startsWith('http') &&
            !signedUrl.includes('localhost') &&
            !signedUrl.includes('s3.local')
          ) {
            return { ...doc, fileUrl: signedUrl };
          }
          return { ...doc, fileUrl: viewEndpoint };
        } catch {
          return { ...doc, fileUrl: viewEndpoint };
        }
      }
      return { ...doc, fileUrl: doc.fileUrl || viewEndpoint };
    })
  );

  return { ...staff, documents: enrichedDocs };
}

export async function getAllStaff(filters?: StaffFilterParams): Promise<StaffMember[]> {
  const staffList = await repo.getAllStaff(filters);
  return Promise.all(staffList.map(enrichStaffDocuments));
}

export async function getStaffById(id: string): Promise<StaffMember> {
  const staff = await repo.getStaffById(id);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }
  return enrichStaffDocuments(staff);
}

export async function createStaff(input: CreateStaffInput): Promise<StaffMember> {
  const created = await repo.createStaff(input);
  return enrichStaffDocuments(created);
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<StaffMember> {
  const updated = await repo.updateStaff(id, input);
  if (!updated) {
    throw new NotFoundError('Staff member not found.');
  }
  return enrichStaffDocuments(updated);
}

export async function updateStaffStatus(id: string, status: StaffStatus): Promise<StaffMember> {
  const updated = await repo.updateStaffStatus(id, status);
  if (!updated) {
    throw new NotFoundError('Staff member not found.');
  }
  return enrichStaffDocuments(updated);
}

export async function deleteStaff(id: string): Promise<void> {
  const staff = await repo.getStaffById(id);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }

  // Delete all staff documents from S3/R2 storage
  if (staff.documents && staff.documents.length > 0) {
    for (const doc of staff.documents) {
      if (doc.storageKey) {
        try {
          await s3Service.deleteFile(doc.storageKey);
        } catch (err) {
          console.warn(`[StaffService] Failed to delete file ${doc.storageKey} from storage:`, err);
        }
      }
    }
  }

  await repo.deleteStaff(id);
}

export async function uploadStaffDocument(params: {
  staffId: string;
  name: string;
  documentType?: string;
  file: Express.Multer.File;
}): Promise<{ staff: StaffMember; document: StaffDocument }> {
  const staff = await repo.getStaffById(params.staffId);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }

  const docId = randomUUID();
  const sanitizedFileName = (params.file.originalname || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `staff_documents/${staff.id}/${Date.now()}_${sanitizedFileName}`;
  const mimeType = params.file.mimetype || 'application/pdf';

  const uploadResult = await s3Service.uploadBuffer(storageKey, params.file.buffer, mimeType);

  let signedUrl = uploadResult.fileUrl;
  if (!signedUrl || signedUrl.includes('s3.local') || signedUrl.startsWith('/api')) {
    signedUrl = `/api/staff/${staff.id}/documents/${docId}/view`;
  }

  const doc: StaffDocument = {
    id: docId,
    name: params.name.trim() || params.file.originalname || 'Staff Document',
    documentType: params.documentType || 'OTHER',
    fileName: params.file.originalname || 'document',
    fileUrl: signedUrl,
    storageKey: uploadResult.key,
    fileSize: params.file.size,
    mimeType,
    uploadedAt: new Date().toISOString(),
  };

  const updatedStaff = await repo.addStaffDocument(staff.id, doc);
  if (!updatedStaff) {
    throw new NotFoundError('Failed to record staff document.');
  }

  return {
    staff: await enrichStaffDocuments(updatedStaff),
    document: doc,
  };
}

export async function deleteStaffDocument(staffId: string, docId: string): Promise<StaffMember> {
  const staff = await repo.getStaffById(staffId);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }

  const targetDoc = staff.documents.find((d) => d.id === docId);
  if (!targetDoc) {
    throw new NotFoundError('Document not found on this staff member.');
  }

  if (targetDoc.storageKey) {
    try {
      await s3Service.deleteFile(targetDoc.storageKey);
    } catch (err) {
      console.warn(`[StaffService] Failed to delete file ${targetDoc.storageKey} from storage:`, err);
    }
  }

  const updatedStaff = await repo.removeStaffDocument(staffId, docId);
  if (!updatedStaff) {
    throw new NotFoundError('Failed to update staff documents.');
  }

  return enrichStaffDocuments(updatedStaff);
}

export async function getStaffDocumentStream(
  staffId: string,
  docId: string
): Promise<{
  stream?: Readable;
  redirectUrl?: string;
  fileName: string;
  mimeType: string;
}> {
  const staff = await repo.getStaffById(staffId);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }

  const targetDoc = staff.documents.find((d) => d.id === docId);
  if (!targetDoc) {
    throw new NotFoundError('Document not found on this staff member.');
  }

  const fileName = targetDoc.fileName || `${targetDoc.name}.pdf`;
  const mimeType = targetDoc.mimeType || 'application/octet-stream';

  if (targetDoc.storageKey) {
    try {
      const { stream, contentType } = await s3Service.getObjectStream(decodeURIComponent(targetDoc.storageKey));
      return {
        stream,
        fileName,
        mimeType: contentType || mimeType,
      };
    } catch (err) {
      console.warn(`[StaffService] Cloud storage stream failed for ${targetDoc.storageKey}:`, err);
    }
  }

  if (
    targetDoc.fileUrl &&
    targetDoc.fileUrl.startsWith('http') &&
    !targetDoc.fileUrl.includes('s3.local')
  ) {
    return {
      redirectUrl: targetDoc.fileUrl,
      fileName,
      mimeType,
    };
  }

  throw new NotFoundError('Document content is currently unavailable in storage.');
}

export async function getDocumentDownloadUrl(
  staffId: string,
  docId: string
): Promise<{ downloadUrl: string; fileName: string; mimeType: string }> {
  const staff = await repo.getStaffById(staffId);
  if (!staff) {
    throw new NotFoundError('Staff member not found.');
  }

  const targetDoc = staff.documents.find((d) => d.id === docId);
  if (!targetDoc) {
    throw new NotFoundError('Document not found.');
  }

  let downloadUrl = targetDoc.fileUrl;
  if (targetDoc.storageKey) {
    try {
      downloadUrl = await s3Service.getReadUrl(decodeURIComponent(targetDoc.storageKey), 3600);
    } catch {
      downloadUrl = `/api/staff/${staff.id}/documents/${docId}/download`;
    }
  }

  return {
    downloadUrl,
    fileName: targetDoc.fileName || `${targetDoc.name}.pdf`,
    mimeType: targetDoc.mimeType || 'application/octet-stream',
  };
}

