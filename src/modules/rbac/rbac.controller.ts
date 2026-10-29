import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  getParamId,
  handleControllerError,
  sendBadRequest,
  sendCreated,
  sendSuccess,
} from '@/shared/index.js';

import { rbacService } from './rbac.service.js';

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  permissions: z
    .array(
      z.object({
        module_slug: z.string(),
        can_read: z.boolean().default(false),
        can_write: z.boolean().default(false),
        can_delete: z.boolean().default(false),
      }),
    )
    .default([]),
});

export const rbacController = {
  async getModules(req: Request, res: Response) {
    try {
      const modules = await rbacService.getModules();
      sendSuccess(res, modules);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to fetch modules');
    }
  },

  async getRoles(req: Request, res: Response) {
    try {
      const roles = await rbacService.getRoles();
      sendSuccess(res, roles);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to fetch roles');
    }
  },

  async getRole(req: Request, res: Response) {
    try {
      const name = getParamId(req, 'name');
      if (!name) {
        sendBadRequest(res, 'Role name is required');
        return;
      }
      const role = await rbacService.getRoleByName(name);
      sendSuccess(res, role);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to fetch role');
    }
  },

  async createRole(req: Request, res: Response) {
    try {
      const data = roleSchema.parse(req.body);
      const role = await rbacService.createRole(data);
      sendCreated(res, role);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to create role');
    }
  },

  async updateRole(req: Request, res: Response) {
    try {
      const name = getParamId(req, 'name');
      if (!name) {
        sendBadRequest(res, 'Role name is required');
        return;
      }
      const data = roleSchema.parse(req.body);
      const role = await rbacService.updateRole(name, data);
      sendSuccess(res, role);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to update role');
    }
  },

  async deleteRole(req: Request, res: Response) {
    try {
      const name = getParamId(req, 'name');
      if (!name) {
        sendBadRequest(res, 'Role name is required');
        return;
      }
      await rbacService.deleteRole(name);
      res.status(204).send();
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to delete role');
    }
  },
};
