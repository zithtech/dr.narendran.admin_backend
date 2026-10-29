import fs from 'node:fs';
import path from 'node:path';

import {NotFoundError} from '@/http/errors.js';

import {s3Service} from '../s3/s3.service.js';
import * as profileRepository from './profile.repository.js';
import type {
  PatientMedicalInfo,
  PatientProfile,
  UpdateMedicalInfoData,
  UpdateProfileData,
} from './profile.types.js';

export async function getProfile(userId: string): Promise<PatientProfile> {
  const profile = await profileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Patient profile not found.');
  }

  if (profile.profileImageUrl?.includes('amazonaws.com')) {
    try {
      const parts = profile.profileImageUrl.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          profile.profileImageUrl = await s3Service.getReadUrl(
            decodeURIComponent(key),
            86400,
          );
        }
      }
    } catch {
      // Keep un-signed fallback URL if signing fails
    }
  }

  return profile;
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileData,
): Promise<PatientProfile> {
  const updated = await profileRepository.upsertProfile(userId, data);
  if (updated.profileImageUrl?.includes('amazonaws.com')) {
    try {
      const parts = updated.profileImageUrl.split('.amazonaws.com/');
      if (parts[1]) {
        const key = parts[1].split('?')[0];
        if (key) {
          updated.profileImageUrl = await s3Service.getReadUrl(
            decodeURIComponent(key),
            86400,
          );
        }
      }
    } catch {
      // Keep un-signed fallback URL if signing fails
    }
  }
  return updated;
}

export async function getMedicalInfo(
  userId: string,
): Promise<PatientMedicalInfo> {
  const profile = await profileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Patient profile not found.');
  }
  return profile.basicMedicalInfo;
}

export async function updateMedicalInfo(
  userId: string,
  data: UpdateMedicalInfoData,
): Promise<PatientMedicalInfo> {
  return profileRepository.upsertMedicalInfo(userId, data);
}

export async function getPresignedUploadUrl(
  userId: string,
  contentType = 'image/jpeg',
  documentType = 'profile_picture',
): Promise<{uploadUrl: string; fileUrl: string; key: string}> {
  const fileExt = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : 'jpg';
  const key = `patient-profiles/${userId}/${documentType}_${Date.now()}.${fileExt}`;
  return s3Service.getUploadUrl(key, contentType);
}

export async function uploadAvatar(
  userId: string,
  options: {
    avatarUrl?: string | undefined;
    profileImageUrl?: string | undefined;
    base64Image?: string | undefined;
    mimeType?: string | undefined;
  },
): Promise<{avatarUrl: string}> {
  const directUrl = options.avatarUrl ?? options.profileImageUrl;
  if (directUrl) {
    await profileRepository.updateAvatarUrl(userId, directUrl);

    let signedAvatarUrl = directUrl;
    if (directUrl.includes('amazonaws.com')) {
      try {
        const parts = directUrl.split('.amazonaws.com/');
        if (parts[1]) {
          const key = parts[1].split('?')[0];
          if (key) {
            signedAvatarUrl = await s3Service.getReadUrl(
              decodeURIComponent(key),
              86400,
            );
          }
        }
      } catch {
        // Keep un-signed fallback URL if signing fails
      }
    }
    return {avatarUrl: signedAvatarUrl};
  }

  if (options.base64Image) {
    const base64Data = options.base64Image.replace(
      /^data:image\/\w+;base64,/,
      '',
    );
    const buffer = Buffer.from(base64Data, 'base64');
    const mimeType = options.mimeType ?? 'image/jpeg';
    const extension = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : 'jpg';
    const fileName = `avatar_${userId}_${Date.now()}.${extension}`;

    const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, {recursive: true});
    }

    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${fileName}`;
    await profileRepository.updateAvatarUrl(userId, avatarUrl);

    return {avatarUrl};
  }

  throw new Error('Invalid avatar data provided.');
}
