 
import type { Request, Response } from "express";

import { ForbiddenError } from "@/http/errors.js";

import { prescriptionsService } from "./prescriptions.service.js";

export const PrescriptionsController = {
  async getAll(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const status = req.query["status"] as string;
      const tab = req.query["tab"] as string;
      const prescriptions = await prescriptionsService.getPrescriptions({ user_id, patient_id, status, tab });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch prescriptions", details: err.message });
    }
  },

  async getHistory(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const prescriptions = await prescriptionsService.getPrescriptions({ user_id, patient_id, tab: "history" });
      res.json({ status: "success", data: prescriptions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch prescription history", details: err.message });
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

      // Authorization: verify the authenticated user owns this prescription
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

      // Authorization: verify the authenticated user owns this prescription
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
};

