import type { Request, Response } from "express";

import { logger } from "@/lib/logger.js";
import { s3Service } from "@/modules/s3/s3.service.js";

import { PrescriptionTemplatesService } from "./prescription_templates.service.js";

export class PrescriptionTemplatesController {
  public static async getActive(req: Request, res: Response): Promise<void> {
    try {
      const hospitalId = (req.query["hospital_id"] as string) || (req.query["hospitalId"] as string) || (req as any).user?.hospital_id || null;
      const branchId = (req.query["branch_id"] as string) || (req.query["branchId"] as string) || (req as any).user?.branch_id || null;

      const template = await PrescriptionTemplatesService.getActiveTemplate(hospitalId, branchId);
      res.json({
        id: template.id,
        name: template.name,
        description: template.description,
        html_content: template.html_content,
        layout_config: template.layout_config,
        status: template.status,
        version: template.version,
        hospital_id: template.hospital_id,
        branch_id: template.branch_id,
        is_default: template.is_default,
        updated_at: template.updated_at,
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to get active prescription template");
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  public static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const hospitalId = (req.query["hospital_id"] as string) || (req.query["hospitalId"] as string) || (req as any).user?.hospital_id || null;
      const status = (req.query["status"] as string) || null;
      const search = (req.query["search"] as string) || null;

      const templates = await PrescriptionTemplatesService.getAllTemplates({
        hospitalId,
        status,
        search,
      });
      res.json({ templates });
    } catch (e) {
      logger.error({ err: e }, "Failed to get prescription templates");
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  public static async getById(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        res.status(400).json({ error: "Template ID is required" });
        return;
      }
      const hospitalId = (req as any).user?.hospital_id || (req.query["hospital_id"] as string) || null;
      const template = await PrescriptionTemplatesService.getTemplateById(id, hospitalId);

      if (!template) {
        res.status(404).json({ error: "Prescription template not found" });
        return;
      }

      res.json({ template, data: template });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to get prescription template by ID");
      res.status(500).json({ error: e?.message || "Internal Server Error" });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, html_content, layout_config, status, hospital_id, branch_id, is_default } = req.body || {};
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name is required and must be a string" });
        return;
      }
      if (!html_content || typeof html_content !== "string") {
        res.status(400).json({ error: "html_content is required and must be a string" });
        return;
      }

      const targetHospitalId = hospital_id || (req as any).user?.hospital_id || null;
      const targetBranchId = branch_id || (req as any).user?.branch_id || null;
      const userId = (req as any).user?.id || null;

      const created = await PrescriptionTemplatesService.createTemplate({
        name,
        description,
        html_content,
        layout_config,
        status: status || "DRAFT",
        hospital_id: targetHospitalId,
        branch_id: targetBranchId,
        is_default: Boolean(is_default),
        user_id: userId,
      });

      res.status(201).json({
        status: "success",
        data: created,
        template: created,
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to create prescription template");
      res.status(500).json({ error: "Internal Server Error", details: e?.message });
    }
  }

  public static async updateActive(req: Request, res: Response): Promise<void> {
    try {
      const { html_content, layout_config, name, description, status, id: bodyId, hospital_id, branch_id } = req.body || {};
      if (!html_content || typeof html_content !== "string") {
        res.status(400).json({ error: "html_content is required and must be a string" });
        return;
      }

      const rawParamId = req.params?.["id"];
      const paramId = Array.isArray(rawParamId) ? rawParamId[0] : rawParamId;
      const targetId = bodyId || paramId;

      const targetHospitalId = hospital_id || (req as any).user?.hospital_id || null;
      const targetBranchId = branch_id || (req as any).user?.branch_id || null;
      const userId = (req as any).user?.id || null;

      const updated = await PrescriptionTemplatesService.saveOrUpdateTemplate({
        id: targetId,
        name,
        description,
        html_content,
        layout_config,
        status: status || "ACTIVE",
        hospital_id: targetHospitalId,
        branch_id: targetBranchId,
        user_id: userId,
      });

      res.json({
        status: "success",
        data: updated,
        id: updated.id,
        name: updated.name,
        version: updated.version,
        html_content: updated.html_content,
        layout_config: updated.layout_config,
        updated_at: updated.updated_at,
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to update prescription template");
      res.status(500).json({ error: "Internal Server Error", details: e?.message });
    }
  }

  public static async activate(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        res.status(400).json({ error: "Template ID is required" });
        return;
      }

      const hospitalId = (req as any).user?.hospital_id || (req.body?.hospital_id as string) || null;
      const activated = await PrescriptionTemplatesService.activateTemplate(id, hospitalId);

      res.json({
        status: "success",
        message: "Prescription template activated successfully",
        data: activated,
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to activate prescription template");
      res.status(500).json({ error: e?.message || "Internal Server Error" });
    }
  }

  public static async duplicate(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        res.status(400).json({ error: "Template ID is required" });
        return;
      }

      const hospitalId = (req as any).user?.hospital_id || (req.body?.hospital_id as string) || null;
      const userId = (req as any).user?.id || null;

      const duplicated = await PrescriptionTemplatesService.duplicateTemplate(id, hospitalId, userId);

      res.status(201).json({
        status: "success",
        message: "Template duplicated as draft",
        data: duplicated,
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to duplicate prescription template");
      res.status(500).json({ error: e?.message || "Internal Server Error" });
    }
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params["id"];
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!id) {
        res.status(400).json({ error: "Template ID is required" });
        return;
      }

      const hospitalId = (req as any).user?.hospital_id || (req.query["hospital_id"] as string) || null;
      const deleted = await PrescriptionTemplatesService.deleteTemplate(id, hospitalId);

      if (!deleted) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      res.json({
        status: "success",
        message: "Prescription template deleted successfully",
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to delete prescription template");
      res.status(500).json({ error: e?.message || "Internal Server Error" });
    }
  }

  public static async generatePreviewPdf(req: Request, res: Response): Promise<void> {
    try {
      const { data, html, uploadToS3, hospital_id, branch_id } = req.body || {};

      let finalHtml = html;
      if (!finalHtml && data) {
        const hospitalId = hospital_id || (req as any).user?.hospital_id || null;
        const branchId = branch_id || (req as any).user?.branch_id || null;
        const activeTemplate = await PrescriptionTemplatesService.getActiveTemplate(hospitalId, branchId);
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
      res.setHeader("Content-Disposition", 'attachment; filename="prescription_preview.pdf"');
      res.send(pdfBuffer);
    } catch (e: any) {
      logger.error({ err: e }, "Failed to generate preview PDF");
      res.status(500).json({ error: "Failed to generate preview PDF", details: e?.message });
    }
  }

  public static async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No image file provided for upload." });
        return;
      }

      const mime = file.mimetype.toLowerCase();
      const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
      if (!ALLOWED.includes(mime) && !mime.startsWith("image/")) {
        res.status(400).json({
          error: `Unsupported image format (${file.mimetype}). Allowed formats: JPG, PNG, WEBP, SVG.`,
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Image file size exceeds the 10MB limit." });
        return;
      }

      const rawHospitalId = (req.body?.hospital_id as string) || (req as any).user?.hospital_id || "common";
      const sanitizedHospitalId = String(rawHospitalId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const sanitizedFileName = (file.originalname || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `uploads/prescription_templates/${sanitizedHospitalId}/${Date.now()}_${sanitizedFileName}`;

      const uploadResult = await s3Service.uploadBuffer(
        storageKey,
        file.buffer,
        file.mimetype || "image/png"
      );

      res.status(200).json({
        status: "success",
        data: {
          url: uploadResult.fileUrl,
          key: uploadResult.key,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        },
      });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to upload prescription template image");
      res.status(500).json({ error: "Failed to upload image", details: e?.message });
    }
  }
}
