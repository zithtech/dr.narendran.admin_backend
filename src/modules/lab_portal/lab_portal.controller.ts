import type { Request, Response } from 'express';

import { labPortalService } from './lab_portal.service.js';
import type { AuthenticatedLabRequest } from './lab_portal.types.js';

export const labPortalController = {
  /* ── Admin Management Endpoints (Called from Labs Management) ── */

  async createPortalAccount(req: Request, res: Response) {
    const labId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await labPortalService.createPortalAccount(labId as string, req.body);
    res.status(201).json(result);
  },

  async getPortalAccount(req: Request, res: Response) {
    const labId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await labPortalService.getPortalAccountByLab(labId as string);
    res.status(200).json(result);
  },

  async resetPortalPassword(req: Request, res: Response) {
    const labId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await labPortalService.resetPortalPassword(labId as string, req.body);
    res.status(200).json(result);
  },

  async resendPortalInvite(req: Request, res: Response) {
    const labId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await labPortalService.resendPortalInvite(labId as string);
    res.status(200).json(result);
  },

  /* ── Client Portal Auth Endpoints ────────────────────────── */

  async login(req: Request, res: Response) {
    const { username, password } = req.body;
    const result = await labPortalService.login(username, password);
    res.status(200).json(result);
  },

  async changePassword(req: AuthenticatedLabRequest, res: Response) {
    const userId = req.labUser!.userId;
    const result = await labPortalService.changePassword(userId, req.body);
    res.status(200).json(result);
  },

  /* ── Client Portal Lab Profile Endpoints ─────────────────── */

  async getProfile(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const profile = await labPortalService.getLabProfile(labId);
    res.status(200).json(profile);
  },

  async updateProfile(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const updated = await labPortalService.updateLabProfile(labId, req.body);
    res.status(200).json(updated);
  },

  /* ── Client Portal Lab Services Endpoints ────────────────── */

  async getServices(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const services = await labPortalService.getLabServices(labId);
    res.status(200).json(services);
  },

  async addService(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const service = await labPortalService.addLabService(labId, req.body);
    res.status(201).json(service);
  },

  async updateService(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const serviceId = Array.isArray(req.params['serviceId'])
      ? req.params['serviceId'][0]
      : req.params['serviceId'];
    const updated = await labPortalService.updateLabService(labId, serviceId as string, req.body);
    res.status(200).json(updated);
  },

  async deleteService(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const serviceId = Array.isArray(req.params['serviceId'])
      ? req.params['serviceId'][0]
      : req.params['serviceId'];
    await labPortalService.deleteLabService(labId, serviceId as string);
    res.status(200).json({ success: true, message: 'Service deleted.' });
  },

  /* ── Client Portal Dashboard & Account ───────────────────── */

  async getDashboard(req: AuthenticatedLabRequest, res: Response) {
    const labId = req.labUser!.labId;
    const data = await labPortalService.getDashboardData(labId);
    res.status(200).json(data);
  },

  async getAccount(req: AuthenticatedLabRequest, res: Response) {
    const userId = req.labUser!.userId;
    const account = await labPortalService.getAccountInfo(userId);
    res.status(200).json(account);
  },

  /* ── Patient Lab Test Reports Management ─────────────────── */

  async searchPatients(req: AuthenticatedLabRequest, res: Response) {
    const query = typeof req.query['query'] === 'string' ? req.query['query'] : '';
    const results = await labPortalService.searchPatients(query);
    res.status(200).json(results);
  },

  async getPatientTestsAndReports(req: AuthenticatedLabRequest, res: Response) {
    const patientId = Array.isArray(req.params['patientId'])
      ? req.params['patientId'][0]
      : req.params['patientId'];
    const data = await labPortalService.getPatientTestsAndReports(patientId as string);
    res.status(200).json(data);
  },

  async uploadLabReport(req: AuthenticatedLabRequest, res: Response) {
    const labUserId = req.labUser!.userId;
    const patientId = Array.isArray(req.params['patientId'])
      ? req.params['patientId'][0]
      : req.params['patientId'];
    const { testName, prescriptionLabTestId, reportDate, notes } = req.body;

    const report = await labPortalService.uploadLabReport({
      labUserId,
      patientId: patientId as string,
      prescriptionLabTestId: prescriptionLabTestId || null,
      testName,
      reportDate,
      notes,
      file: req.file,
    });
    res.status(201).json(report);
  },

  async deleteReport(req: AuthenticatedLabRequest, res: Response) {
    const labUserId = req.labUser!.userId;
    const reportId = Array.isArray(req.params['reportId'])
      ? req.params['reportId'][0]
      : req.params['reportId'];
    const result = await labPortalService.deleteLabReport(labUserId, reportId as string);
    res.status(200).json(result);
  },
};

