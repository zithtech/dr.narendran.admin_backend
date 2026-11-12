import express, { Router } from "express";

import { requirePermission } from "@/http/middleware/rbac.middleware.js";

import { PrescriptionTemplatesController } from "./prescription_templates.controller.js";

export const prescriptionTemplatesRouter: Router = Router();

prescriptionTemplatesRouter.use(express.json({ limit: "15mb" }));

prescriptionTemplatesRouter.get("/active", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.getActive);
prescriptionTemplatesRouter.put("/active", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.put("/:id", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.post("/", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.get("/", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.getAll);
prescriptionTemplatesRouter.post("/preview-pdf", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.generatePreviewPdf);
