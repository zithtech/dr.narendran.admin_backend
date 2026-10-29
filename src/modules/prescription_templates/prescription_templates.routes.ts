import express, { Router } from "express";

import { PrescriptionTemplatesController } from "./prescription_templates.controller.js";

export const prescriptionTemplatesRouter: Router = Router();

prescriptionTemplatesRouter.use(express.json({ limit: "15mb" }));

prescriptionTemplatesRouter.get("/active", PrescriptionTemplatesController.getActive);
prescriptionTemplatesRouter.put("/active", PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.put("/:id", PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.post("/", PrescriptionTemplatesController.updateActive);
prescriptionTemplatesRouter.get("/", PrescriptionTemplatesController.getAll);
prescriptionTemplatesRouter.post("/preview-pdf", PrescriptionTemplatesController.generatePreviewPdf);
