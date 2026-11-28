import express, { Router } from "express";
import multer from "multer";

import { requirePermission } from "@/http/middleware/rbac.middleware.js";

import { PrescriptionTemplatesController } from "./prescription_templates.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export const prescriptionTemplatesRouter: Router = Router();

prescriptionTemplatesRouter.use(express.json({ limit: "15mb" }));

// Active template
prescriptionTemplatesRouter.get("/active", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.getActive);
prescriptionTemplatesRouter.put("/active", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.updateActive);

// Preview PDF
prescriptionTemplatesRouter.post("/preview-pdf", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.generatePreviewPdf);

// Image / Logo Upload
prescriptionTemplatesRouter.post(
  "/upload-image",
  requirePermission("PRESCRIPTIONS", "update"),
  upload.single("file"),
  PrescriptionTemplatesController.uploadImage
);

// Full template management
prescriptionTemplatesRouter.get("/", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.getAll);
prescriptionTemplatesRouter.post("/", requirePermission("PRESCRIPTIONS", "create"), PrescriptionTemplatesController.create);
prescriptionTemplatesRouter.get("/:id", requirePermission("PRESCRIPTIONS", "read"), PrescriptionTemplatesController.getById);
prescriptionTemplatesRouter.put("/:id", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.delete("/:id", requirePermission("PRESCRIPTIONS", "delete"), PrescriptionTemplatesController.delete);
prescriptionTemplatesRouter.post("/:id/activate", requirePermission("PRESCRIPTIONS", "update"), PrescriptionTemplatesController.activate);
prescriptionTemplatesRouter.post("/:id/duplicate", requirePermission("PRESCRIPTIONS", "create"), PrescriptionTemplatesController.duplicate);
