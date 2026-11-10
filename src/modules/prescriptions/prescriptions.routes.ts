import { Router } from "express";

import { requireAuth } from "@/http/middleware/authenticate.js";

import { MedicineScheduleController } from "./medicineSchedule.controller.js";
import { PrescriptionsController } from "./prescriptions.controller.js";

export const prescriptionsRouter: Router = Router();

// Medicine schedule & adherence tracking endpoints (Must be declared before /:id)
prescriptionsRouter.get("/schedule/today", requireAuth, MedicineScheduleController.getToday);
prescriptionsRouter.get("/schedule/history", requireAuth, MedicineScheduleController.getHistory);
prescriptionsRouter.patch("/schedule/:id/taken", requireAuth, MedicineScheduleController.markTaken);
prescriptionsRouter.patch("/schedule/:id/skipped", requireAuth, MedicineScheduleController.skipDose);
prescriptionsRouter.get("/schedule/patient/:patientId/monitoring", requireAuth, MedicineScheduleController.getDoctorMonitoring);
prescriptionsRouter.post("/schedule/check-reminders", MedicineScheduleController.checkReminders);

// Prescription endpoints
prescriptionsRouter.get("/", requireAuth, PrescriptionsController.getAll);
prescriptionsRouter.get("/history", requireAuth, PrescriptionsController.getHistory);
prescriptionsRouter.get("/patient/:patientId", requireAuth, PrescriptionsController.getByPatient);
prescriptionsRouter.get("/appointment/:appointmentId", requireAuth, PrescriptionsController.getByAppointment);

prescriptionsRouter.post("/", requireAuth, PrescriptionsController.create);
prescriptionsRouter.put("/:id", requireAuth, PrescriptionsController.update);

prescriptionsRouter.get("/:id/pdf", PrescriptionsController.downloadPdf);
prescriptionsRouter.get("/:id/html", PrescriptionsController.downloadHtml);
prescriptionsRouter.get("/:id/medicines", requireAuth, PrescriptionsController.getMedicines);
prescriptionsRouter.get("/:id", requireAuth, PrescriptionsController.getById);
