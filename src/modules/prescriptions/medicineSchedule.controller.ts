import type { Request, Response } from 'express';

import { UnauthorizedError } from '@/http/errors.js';

import { medicineScheduleService } from './medicineSchedule.service.js';

export class MedicineScheduleController {
  static async getToday(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError('Authentication required.');
    const result = await medicineScheduleService.getTodaySchedule(req.user.id);
    res.status(200).json({ status: 'success', data: result });
  }

  static async getHistory(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError('Authentication required.');
    const timeRange = typeof req.query['timeRange'] === 'string' ? req.query['timeRange'] : undefined;
    const medicine = typeof req.query['medicine'] === 'string' ? req.query['medicine'] : undefined;
    const result = await medicineScheduleService.getAdherenceHistory(req.user.id, timeRange, medicine);
    res.status(200).json({ status: 'success', data: result });
  }

  static async markTaken(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError('Authentication required.');
    const id = typeof req.params['id'] === 'string' ? req.params['id'] : '';
    const result = await medicineScheduleService.markDoseAsTaken(id, req.user.id);
    res.status(200).json({ status: 'success', data: result, message: 'Dose marked as taken.' });
  }

  static async skipDose(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError('Authentication required.');
    const id = typeof req.params['id'] === 'string' ? req.params['id'] : '';
    const body = (req.body as { reason?: string } | undefined) ?? {};
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const result = await medicineScheduleService.skipDose(id, req.user.id, reason);
    res.status(200).json({ status: 'success', data: result, message: 'Dose marked as skipped.' });
  }

  static async getDoctorMonitoring(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError('Authentication required.');
    const patientId = typeof req.params['patientId'] === 'string' ? req.params['patientId'] : '';
    const result = await medicineScheduleService.getDoctorPatientMonitoring(patientId);
    res.status(200).json({ status: 'success', data: result });
  }

  static async checkReminders(req: Request, res: Response): Promise<void> {
    const { medicineDoseSchedulerService } = await import('./medicineDoseScheduler.service.js');
    const stats = await medicineDoseSchedulerService.runSchedulerCycle();
    res.status(200).json({ status: 'success', data: stats });
  }
}
