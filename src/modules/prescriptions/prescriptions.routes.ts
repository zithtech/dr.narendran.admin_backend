import { Router } from "express";

import { requireAuth } from "@/http/middleware/authenticate.js";
import {
  requirePermission,
  requirePermissionOrPatient,
} from "@/http/middleware/rbac.middleware.js";

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
prescriptionsRouter.get(
  "/",
  requireAuth,
  requirePermission("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getAll,
);
prescriptionsRouter.get(
  "/history",
  requireAuth,
  requirePermission("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getHistory,
);
prescriptionsRouter.get(
  "/patient/:patientId",
  requireAuth,
  requirePermissionOrPatient("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getByPatient,
);
prescriptionsRouter.get(
  "/appointment/:appointmentId",
  requireAuth,
  requirePermissionOrPatient("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getByAppointment,
);

prescriptionsRouter.post("/", requireAuth, requirePermission("PRESCRIPTIONS", "create"), PrescriptionsController.create);
prescriptionsRouter.put("/:id", requireAuth, requirePermission("PRESCRIPTIONS", "update"), PrescriptionsController.update);

prescriptionsRouter.get("/:id/pdf", PrescriptionsController.downloadPdf);
prescriptionsRouter.get("/:id/html", PrescriptionsController.downloadHtml);
prescriptionsRouter.get(
  "/:id/medicines",
  requireAuth,
  requirePermissionOrPatient("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getMedicines,
);
prescriptionsRouter.get(
  "/:id",
  requireAuth,
  requirePermissionOrPatient("PRESCRIPTIONS", "read", ["APPOINTMENTS", "TODAYS_SCHEDULE", "PATIENTS"]),
  PrescriptionsController.getById,
);
