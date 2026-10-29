import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  getParamId,
  handleControllerError,
  sendBadRequest,
  sendCreated,
  sendNotFound,
  sendSuccess,
} from '@/shared/index.js';

import { hospitalBranchesService } from './hospital_branches.service.js';

const branchSchema = z.object({
  hospital_id: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const HospitalBranchesController = {
  async getAll(req: Request, res: Response) {
    try {
      const hospitalId = (req.query['hospital_id'] as string) || (req.query['hospitalId'] as string);
      const branches = await hospitalBranchesService.getAllBranches(hospitalId);
      sendSuccess(res, branches);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to fetch branches');
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = branchSchema.parse(req.body);
      const cleanData = {
        ...data,
        address: data.address || null,
        phone: data.phone || null,
      };
      const branch = await hospitalBranchesService.createBranch(cleanData);
      sendCreated(res, branch);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to create branch');
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = getParamId(req, 'id');
      if (!id) {
        sendBadRequest(res, 'Invalid branch ID');
        return;
      }
      const data = branchSchema.parse(req.body);
      const cleanData = {
        ...data,
        address: data.address || null,
        phone: data.phone || null,
      };
      const branch = await hospitalBranchesService.updateBranch({
        id,
        ...cleanData,
      });
      if (!branch) {
        sendNotFound(res, 'Branch');
        return;
      }
      sendSuccess(res, branch);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to update branch');
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = getParamId(req, 'id');
      if (!id) {
        sendBadRequest(res, 'Invalid branch ID');
        return;
      }
      const success = await hospitalBranchesService.deleteBranch(id);
      if (!success) {
        sendNotFound(res, 'Branch');
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to delete branch');
    }
  },
};
