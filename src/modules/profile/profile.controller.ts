import type {Request, Response} from 'express';

import {UnauthorizedError} from '@/http/errors.js';
import type {ValidatedData} from '@/http/middleware/validate.js';
import { proxyImage } from '@/modules/proxy/proxy.controller.js';

import {s3Service} from '../s3/s3.service.js';
import type {
  getUploadUrlSchema,
  updateMedicalInfoSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from './profile.schema.js';
import * as profileService from './profile.service.js';

type UpdateProfileInput = ValidatedData<{body: typeof updateProfileSchema}>;
type UpdateMedicalInfoInput = ValidatedData<{
  body: typeof updateMedicalInfoSchema;
}>;
type GetUploadUrlInput = ValidatedData<{body: typeof getUploadUrlSchema}>;
type UploadAvatarInput = ValidatedData<{body: typeof uploadAvatarSchema}>;

export async function getProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const profile = await profileService.getProfile(req.user.id);
  res.status(200).json(profile);
}

export async function updateProfile(
  input: UpdateProfileInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const updated = await profileService.updateProfile(req.user.id, input.body);
  res.status(200).json(updated);
}

export async function getMedicalInfo(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const medicalInfo = await profileService.getMedicalInfo(req.user.id);
  res.status(200).json(medicalInfo);
}

export async function updateMedicalInfo(
  input: UpdateMedicalInfoInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const updated = await profileService.updateMedicalInfo(
    req.user.id,
    input.body,
  );
  res.status(200).json(updated);
}

export async function getUploadUrl(
  input: GetUploadUrlInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const {contentType, documentType, fileName} = input.body;
  const result = await profileService.getPresignedUploadUrl(
    req.user.id,
    contentType,
    documentType ?? fileName ?? 'profile_picture',
  );
  res.status(200).json(result);
}

export async function uploadAvatar(
  input: UploadAvatarInput,
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required.');
  }
  const result = await profileService.uploadAvatar(req.user.id, input.body);
  res.status(200).json(result);
}

export async function getMediaProxy(
  req: Request,
  res: Response,
): Promise<void> {
  return proxyImage(req, res);
}
