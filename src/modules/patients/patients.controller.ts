import type {Request, Response} from 'express';
import {z} from 'zod';

import {patientSchema, patientSettingsUpdateSchema} from './patients.schema.js';
import {patientsService} from './patients.service.js';

export const PatientsController = {
  async getAll(req: Request, res: Response) {
    try {
      const searchParam = req.query['search'];
      const search = typeof searchParam === 'string' ? searchParam.trim() : undefined;
      const patients = await patientsService.getAllPatients(search);
      res.json(patients);
    } catch (err: any) {
      res.status(500).json({error: 'Failed to fetch patients'});
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const patient = await patientsService.getPatientById(String(id));
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }
      return res.json(patient);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch patient' });
    }
  },

  async getSettings(req: Request, res: Response) {
    try {
      const hospitalIdParam = req.query['hospital_id'];
      const hospitalId = typeof hospitalIdParam === 'string' && hospitalIdParam.trim() ? hospitalIdParam.trim() : undefined;
      const settings = await patientsService.getPatientSettings(hospitalId);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch patient settings' });
    }
  },

  async updateSettings(req: Request, res: Response) {
    try {
      const parsed = patientSettingsUpdateSchema.parse(req.body);
      const settings = await patientsService.updatePatientSettings(parsed.hospital_id, parsed.prefix);
      res.json(settings);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: (err as any).issues[0]?.message || 'Invalid input data' });
        return;
      }
      const message = (err as any)?.message || 'Failed to update patient settings';
      res.status(400).json({ error: message });
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
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        height_cm: data.height_cm || null,
        weight_kg: data.weight_kg || null,
        blood_group: data.blood_group || null,
        blood_pressure: data.blood_pressure || null,
        blood_sugar: data.blood_sugar || null,
        body_temperature: data.body_temperature || null,
        custom_vitals: data.custom_vitals || [],
        marital_status: data.marital_status || null,
        emergency_contacts: data.emergency_contacts || null,
        profile_image_url: data.profile_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
        referred_by: data.referred_by || null,
        referral_id: data.referral_id || null,
        referral_doctor_id: data.referral_doctor_id || null,
        alliance_doctor_id: data.alliance_doctor_id || null,
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
          .json({error: 'User account or patient code already exists'});
        return;
      }
      const message = (err as any)?.message || 'Failed to create patient';
      res.status(500).json({error: message});
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
        address_line_1: data.address_line_1 || null,
        address_line_2: data.address_line_2 || null,
        city: data.city || null,
        state: data.state || null,
        pincode: data.pincode || null,
        height_cm: data.height_cm || null,
        weight_kg: data.weight_kg || null,
        blood_group: data.blood_group || null,
        blood_pressure: data.blood_pressure || null,
        blood_sugar: data.blood_sugar || null,
        body_temperature: data.body_temperature || null,
        custom_vitals: data.custom_vitals || [],
        marital_status: data.marital_status || null,
        emergency_contacts: data.emergency_contacts || null,
        profile_image_url: data.profile_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
        referred_by: data.referred_by || null,
        referral_id: data.referral_id || null,
        referral_doctor_id: data.referral_doctor_id || null,
        alliance_doctor_id: data.alliance_doctor_id || null,
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
