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

import { hospitalSchema } from './hospitals.schema.js';
import { hospitalsService } from './hospitals.service.js';

export const HospitalsController = {
  async getAll(req: Request, res: Response) {
    try {
      const hospitals = await hospitalsService.getAllHospitals();
      sendSuccess(res, hospitals);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to fetch hospitals');
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = hospitalSchema.parse(req.body);
      const cleanData = {
        ...data,
        address: data.address || null,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        phone: data.phone || null,
        email: data.email || null,
      };
      const hospital = await hospitalsService.createHospital(cleanData);
      sendCreated(res, hospital);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to create hospital');
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = getParamId(req, 'id');
      if (!id) {
        sendBadRequest(res, 'Invalid hospital ID');
        return;
      }
      const data = hospitalSchema.parse(req.body);
      const cleanData = {
        ...data,
        address: data.address || null,
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        phone: data.phone || null,
        email: data.email || null,
      };
      const hospital = await hospitalsService.updateHospital({
        id,
        ...cleanData,
      });
      if (!hospital) {
        sendNotFound(res, 'Hospital');
        return;
      }
      sendSuccess(res, hospital);
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to update hospital');
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = getParamId(req, 'id');
      if (!id) {
        sendBadRequest(res, 'Invalid hospital ID');
        return;
      }
      const success = await hospitalsService.deleteHospital(id);
      if (!success) {
        sendNotFound(res, 'Hospital');
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      handleControllerError(res, err, 'Failed to delete hospital');
    }
  },
};
