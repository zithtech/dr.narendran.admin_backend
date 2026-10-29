 
import type { Request, Response } from "express";

import { ordersService } from "./orders.service.js";

export const OrdersController = {
  async getMyOrders(req: Request, res: Response) {
    try {
      const user_id = (req as any).user?.id ? String((req as any).user.id) : (typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined);
      const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;

      const orders = await ordersService.getMyOrders({ user_id, status });
      res.json({ status: "success", data: orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch my orders", details: err.message });
    }
  },

  async getOrders(req: Request, res: Response) {
    try {
      const user_id = typeof req.query["user_id"] === "string" ? req.query["user_id"] : undefined;
      const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
      const page = req.query["page"] ? Number(req.query["page"]) : undefined;
      const limit = req.query["limit"] ? Number(req.query["limit"]) : undefined;

      const orders = await ordersService.getOrders({ user_id, status, page, limit });
      res.json({ status: "success", data: orders });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch orders", details: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = String(req.params["id"] || "").trim();
      if (!id || id === "undefined" || id === "null") {
        res.status(400).json({ error: "Invalid order ID" });
        return;
      }
      const order = await ordersService.getOrderById(id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      res.json({ status: "success", data: order });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch order details", details: err.message });
    }
  },
  async updateStatus(req: Request, res: Response) {
    try {
      const id = String(req.params["id"] || "").trim();
      const { status, note } = req.body || {};
      if (!id || !status) {
        res.status(400).json({ error: "Order ID and status are required" });
        return;
      }
      const result = await ordersService.updateOrderStatus(id, status, { note });
      res.json({ status: "success", data: result });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update order status", details: err.message });
    }
  },
};
