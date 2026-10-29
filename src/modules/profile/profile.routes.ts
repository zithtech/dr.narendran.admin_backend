import express, {Router} from 'express';

import {requireAuth} from '@/http/middleware/authenticate.js';
import {handler} from '@/http/middleware/validate.js';

import * as profileController from './profile.controller.js';
import {
  getUploadUrlSchema,
  updateMedicalInfoSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from './profile.schema.js';

export const profileRouter: Router = Router();

profileRouter.get('/media-proxy', profileController.getMediaProxy);

profileRouter.use(requireAuth);

profileRouter.get('/me', profileController.getProfile);

profileRouter.patch(
  '/me',
  ...handler({body: updateProfileSchema}, profileController.updateProfile),
);

profileRouter.put(
  '/me',
  ...handler({body: updateProfileSchema}, profileController.updateProfile),
);

profileRouter.get('/me/medical', profileController.getMedicalInfo);

profileRouter.patch(
  '/me/medical',
  ...handler(
    {body: updateMedicalInfoSchema},
    profileController.updateMedicalInfo,
  ),
);

profileRouter.put(
  '/me/medical',
  ...handler(
    {body: updateMedicalInfoSchema},
    profileController.updateMedicalInfo,
  ),
);

profileRouter.post(
  '/me/upload-url',
  ...handler({body: getUploadUrlSchema}, profileController.getUploadUrl),
);

profileRouter.post(
  '/me/avatar',
  express.json({limit: '10mb'}),
  ...handler({body: uploadAvatarSchema}, profileController.uploadAvatar),
);
