import type { Request, Response } from "express";

import { ForbiddenError } from "@/http/errors.js";

import { prescriptionsService } from "./prescriptions.service.js";

export const PrescriptionsController = {
  async getAll(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const appointment_id = typeof req.query["appointment_id"] === "string" ? req.query["appointment_id"] : undefined;
      const doctor_id = typeof req.query["doctor_id"] === "string" ? req.query["doctor_id"] : undefined;
      const status = req.query["status"] as string;
      const tab = req.query["tab"] as string;
      const search = req.query["search"] as string;
      const limit = req.query["limit"] ? parseInt(req.query["limit"] as string, 10) : undefined;
      const offset = req.query["offset"] ? parseInt(req.query["offset"] as string, 10) : undefined;

      // Only scope to user_id if explicitly requested in query, OR if the requester is a patient
      let effectivePatientId = patient_id;
      let effectiveUserId = typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined;

      const userRole = (user?.role || '').toLowerCase();
      if (userRole === 'patient') {
        effectiveUserId = String(user.id);
      }

      const prescriptions = await prescriptionsService.getPrescriptions({
        user_id: effectiveUserId,
        patient_id: effectivePatientId,
        appointment_id,
        doctor_id,
        status,
        tab,
        search,
        limit,
        offset,
      });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch prescriptions", details: err.message });
    }
  },

  async getHistory(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const userRole = (user?.role || '').toLowerCase();
      const user_id = userRole === 'patient' && user?.id ? String(user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const prescriptions = await prescriptionsService.getPrescriptions({ user_id, patient_id, tab: "history" });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch prescription history", details: err.message });
    }
  },

  async getByPatient(req: Request, res: Response) {
    try {
      const patientId = String(req.params["patientId"]);
      if (!patientId) {
        res.status(400).json({ error: "Patient ID is required" });
        return;
      }
      const prescriptions = await prescriptionsService.getPrescriptions({ patient_id: patientId });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch patient prescriptions", details: err.message });
    }
  },

  async getByAppointment(req: Request, res: Response) {
    try {
      const appointmentId = String(req.params["appointmentId"]);
      if (!appointmentId) {
        res.status(400).json({ error: "Appointment ID is required" });
        return;
      }
      const prescriptions = await prescriptionsService.getPrescriptions({ appointment_id: appointmentId });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch appointment prescriptions", details: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params["id"]);
      if (!id) {
        res.status(400).json({ error: "Invalid prescription ID" });
        return;
      }
      const prescription = await prescriptionsService.getPrescriptionById(id);
      if (!prescription) {
        res.status(404).json({ error: "Prescription not found" });
        return;
      }

      const user = (req as any).user;
      if (user) {
        const isAuthorized = await prescriptionsService.canAccessPrescription(user.id, user.role, prescription);
        if (!isAuthorized) {
          throw new ForbiddenError("You do not have permission to view this prescription.");
        }
      }

      res.json({ status: "success", data: prescription });
    } catch (err: any) {
      if (err?.statusCode === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Failed to fetch prescription details", details: err.message });
    }
  },

  async getMedicines(req: Request, res: Response) {
    try {
      const id = String(req.params["id"]);
      const prescription = await prescriptionsService.getPrescriptionById(id);
      if (!prescription) {
        res.status(404).json({ error: "Prescription not found" });
        return;
      }

      const user = (req as any).user;
      if (user) {
        const isAuthorized = await prescriptionsService.canAccessPrescription(user.id, user.role, prescription);
        if (!isAuthorized) {
          throw new ForbiddenError("You do not have permission to view this prescription.");
        }
      }

      const medicines = await prescriptionsService.getMedicinesByPrescriptionId(id);
      res.json({ status: "success", data: medicines });
    } catch (err: any) {
      if (err?.statusCode === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Failed to fetch medicines", details: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const actorUserId = (req as any).user?.id;
      const created = await prescriptionsService.createPrescription(req.body, actorUserId);
      res.status(201).json({ status: "success", data: created });
    } catch (err: any) {
      res.status(400).json({ error: "Failed to create prescription", details: err.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = String(req.params["id"]);
      if (!id) {
        res.status(400).json({ error: "Invalid prescription ID" });
        return;
      }
      const updated = await prescriptionsService.updatePrescription(id, req.body);
      res.json({ status: "success", data: updated });
    } catch (err: any) {
      res.status(400).json({ error: "Failed to update prescription", details: err.message });
    }
  },

  async downloadPdf(req: Request, res: Response) {
    try {
      const id = String(req.params["id"]);
      if (!id) {
        res.status(400).json({ error: "Invalid prescription ID" });
        return;
      }
      const { pdfBuffer, filename } = await prescriptionsService.generatePrescriptionPdf(id);
      const disposition = req.query["inline"] === "true" ? "inline" : "attachment";
      const safeFilename = filename.replace(/["\r\n]/g, "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="${safeFilename}"`);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate prescription PDF", details: err.message });
    }
  },

  async downloadHtml(req: Request, res: Response) {
    try {
      const id = String(req.params["id"]);
      if (!id) {
        res.status(400).json({ error: "Invalid prescription ID" });
        return;
      }
      const html = await prescriptionsService.generatePrescriptionHtml(id);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate prescription HTML", details: err.message });
    }
  },
};
