 
import type { Request, Response } from "express";

import { pharmacyOrdersService } from "./pharmacy_orders.service.js";

export const PharmacyOrdersController = {
  async getReviewOrderInfo(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const data = await pharmacyOrdersService.getReviewOrderInfo(user_id);
      res.json({ status: "success", data });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch review order info", details: err.message });
    }
  },

  async getMyPharmacyOrders(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const patient_id = typeof req.query["patient_id"] === "string" ? req.query["patient_id"] : undefined;
      const status = typeof req.query["status"] === "string" ? req.query["status"] : "all";

      const orders = await pharmacyOrdersService.getMyPharmacyOrders({ user_id, patient_id, status });
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch pharmacy orders", details: err.message });
    }
  },

  async getPharmacyOrderDetails(req: Request, res: Response) {
    try {
      const id = String(req.params["id"] || "").trim();
      if (!id || id === "undefined" || id === "null") {
        res.status(400).json({ error: "Invalid order ID" });
        return;
      }
      const order = await pharmacyOrdersService.getPharmacyOrderDetails(id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      res.json({ status: "success", data: order });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch order details", details: err.message });
    }
  },

  async createOrder(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : undefined;
      const { prescription_id, items, delivery_address, patient_id } = req.body;
      const result = await pharmacyOrdersService.createOrder({ user_id, patient_id, prescription_id, items, delivery_address });
      res.status(201).json({ status: "success", data: result });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to place order", details: err.message });
    }
  },
};
