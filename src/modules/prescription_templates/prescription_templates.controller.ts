import type { Request, Response } from "express";

import { logger } from "@/lib/logger.js";
import { s3Service } from "@/modules/s3/s3.service.js";

import { PrescriptionTemplatesService } from "./prescription_templates.service.js";

export class PrescriptionTemplatesController {
  public static async getActive(_req: Request, res: Response): Promise<void> {
    try {
      const template = await PrescriptionTemplatesService.getActiveTemplate();
      res.json({
        id: template.id,
        name: template.name,
        description: template.description,
        html_content: template.html_content,
        status: template.status,
        version: template.version,
        updated_at: template.updated_at,
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to get active prescription template");
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  public static async updateActive(req: Request, res: Response): Promise<void> {
    try {
      const { html_content, name, description, status, id } = req.body || {};
      if (!html_content || typeof html_content !== "string") {
        res.status(400).json({ error: "html_content is required and must be a string" });
        return;
      }
      const updated = await PrescriptionTemplatesService.saveOrUpdateTemplate({
        id: id || req.params?.["id"],
        name,
        description,
        html_content,
        status: status || "ACTIVE",
      });
      res.json({
        status: "success",
        data: updated,
        id: updated.id,
        name: updated.name,
        version: updated.version,
        html_content: updated.html_content,
        updated_at: updated.updated_at,
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to update prescription template");
      res.status(500).json({ error: "Internal Server Error", details: (e as any)?.message });
    }
  }

  public static async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const templates = await PrescriptionTemplatesService.getAllTemplates();
      res.json({ templates });
    } catch (e) {
      logger.error({ err: e }, "Failed to get prescription templates");
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  public static async generatePreviewPdf(req: Request, res: Response): Promise<void> {
    try {
      const { data, html, uploadToS3 } = req.body || {};

      let finalHtml = html;
      if (!finalHtml && data) {
        const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate();
        finalHtml = PrescriptionTemplatesService.resolveTemplate(activeTemplate.html_content, data);
      }

      if (!finalHtml) {
        res.status(400).json({ error: "Either html or data must be provided" });
        return;
      }

      const pdfBuffer = await PrescriptionTemplatesService.generatePdfBuffer(finalHtml);

      if (uploadToS3) {
        const userId = (req as any).user?.id || "preview";
        const key = `prescriptions/previews/${userId}/preview_${Date.now()}.pdf`;
        const { fileUrl } = await s3Service.uploadBuffer(key, pdfBuffer, "application/pdf");
        const signedUrl = await s3Service.getReadUrl(key, 86400);

        const { prescriptionId, appointmentId } = req.body || {};
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validPrescriptionId = typeof prescriptionId === "string" && UUID_REGEX.test(prescriptionId) ? prescriptionId : null;
        const validAppointmentId = typeof appointmentId === "string" && UUID_REGEX.test(appointmentId) ? appointmentId : null;

        if (validPrescriptionId || validAppointmentId) {
          try {
            const { pool } = await import("@/db/pool.js");
            if (validPrescriptionId) {
              await pool.query(
                "UPDATE prescriptions SET prescription_url = $1, updated_at = NOW() WHERE id = $2",
                [fileUrl, validPrescriptionId]
              );
            } else if (validAppointmentId) {
              await pool.query(
                "UPDATE prescriptions SET prescription_url = $1, updated_at = NOW() WHERE appointment_id = $2",
                [fileUrl, validAppointmentId]
              );
            }
          } catch (dbErr) {
            logger.warn({ err: dbErr }, "Failed to update prescription record with preview PDF URL");
          }
        }
        res.json({
          status: "success",
          data: {
            pdfUrl: signedUrl || fileUrl,
            fileUrl,
            key,
          },
        });
        return;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=\"prescription_preview.pdf\"");
      res.send(pdfBuffer);
    } catch (e: any) {
      logger.error({ err: e }, "Failed to generate preview PDF");
      res.status(500).json({ error: "Failed to generate preview PDF", details: e?.message });
    }
  }
}
