 
import type { Request, Response } from "express";

import { pharmacyService } from "./pharmacy.service.js";

export const PharmacyController = {
  async getMyPharmacyOrders(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const status = typeof req.query["status"] === "string" ? req.query["status"] : "all";

      const orders = await pharmacyService.getMyPharmacyOrders({ user_id, patient_id, status });
      res.json({ success: true, orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch pharmacy orders", details: err.message });
    }
  },

  async createOrder(req: Request, res: Response) {
    try {
      const { prescription_id, items, delivery_address } = req.body;
      if (!prescription_id || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "prescription_id and items array are required" });
        return;
      }
      const order = await pharmacyService.createOrder({ prescription_id, items, delivery_address });
      res.status(201).json({ status: "success", data: order });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to place pharmacy order", details: err.message });
    }
  },

  async getOrderById(req: Request, res: Response) {
    try {
      const id = String(req.params["id"] || "").trim();
      if (!id || id === "undefined" || id === "null") {
        res.status(400).json({ error: "Invalid order ID" });
        return;
      }
      const order = await pharmacyService.getOrderById(id);
      if (!order) {
        res.status(404).json({ error: "Pharmacy order not found" });
        return;
      }
      res.json({ status: "success", data: order });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch pharmacy order", details: err.message });
    }
  },
};
