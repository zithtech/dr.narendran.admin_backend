import type {Request, Response} from 'express';
import {z} from 'zod';

import {patientsService} from './patients.service.js';

const patientSchema = z.object({
  user_account_id: z.string().uuid().optional().nullable(),
  hospital_id: z.string().uuid(),
  branch_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .email('Invalid email')
    .optional()
    .nullable()
    .or(z.literal('')),
  date_of_birth: z.string().optional().nullable().or(z.literal('')),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  height_cm: z.number().optional().nullable(),
  weight_kg: z.number().optional().nullable(),
  blood_group: z.string().optional().nullable(),
  marital_status: z.string().optional().nullable(),
  emergency_contacts: z.any().optional().nullable(),
  profile_image_url: z.string().optional().nullable(),
  is_active: z.boolean().optional().nullable(),
});

export const PatientsController = {
  async getAll(req: Request, res: Response) {
    try {
      const patients = await patientsService.getAllPatients();
      res.json(patients);
    } catch (err: any) {
      res.status(500).json({error: 'Failed to fetch patients'});
    }
  },

  async create(req: Request, res: Response) {
    try {
      const data = patientSchema.parse(req.body);
      const cleanData = {
        ...data,
        user_account_id: data.user_account_id || null,
        branch_id: data.branch_id || null,
        phone: data.phone || null,
        email: data.email || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        address: data.address || null,
        height_cm: data.height_cm || null,
        weight_kg: data.weight_kg || null,
        blood_group: data.blood_group || null,
        marital_status: data.marital_status || null,
        emergency_contacts: data.emergency_contacts || null,
        profile_image_url: data.profile_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
      const patient = await patientsService.createPatient(cleanData);
      res.status(201).json(patient);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      if ((err as any).code === '23505') {
        res
          .status(400)
          .json({error: 'User account is already linked to another patient'});
        return;
      }
      res.status(500).json({error: 'Failed to create patient'});
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid patient ID'});
        return;
      }
      const data = patientSchema.parse(req.body);
      const cleanData = {
        ...data,
        user_account_id: data.user_account_id || null,
        branch_id: data.branch_id || null,
        phone: data.phone || null,
        email: data.email || null,
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        address: data.address || null,
        height_cm: data.height_cm || null,
        weight_kg: data.weight_kg || null,
        blood_group: data.blood_group || null,
        marital_status: data.marital_status || null,
        emergency_contacts: data.emergency_contacts || null,
        profile_image_url: data.profile_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
      const patient = await patientsService.updatePatient({id, ...cleanData});
      if (!patient) {
        res.status(404).json({error: 'Patient not found'});
        return;
      }
      res.json(patient);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({error: (err as any).issues[0].message});
        return;
      }
      if ((err as any).code === '23505') {
        res
          .status(400)
          .json({error: 'User account is already linked to another patient'});
        return;
      }
      res.status(500).json({error: 'Failed to update patient'});
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params['id']);
      if (!id) {
        res.status(400).json({error: 'Invalid patient ID'});
        return;
      }
      const success = await patientsService.deletePatient(id);
      if (!success) {
        res.status(404).json({error: 'Patient not found'});
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({error: 'Failed to delete patient'});
    }
  },
};
