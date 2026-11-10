import type { NextFunction, Request, Response } from "express";

import { BadRequestError } from "@/http/errors.js";

import { ordersService } from "./orders.service.js";

export const OrdersController = {
  /**
   * GET /api/orders
   * Admin order listing with pagination, search, status & payment filtering, and date ranges.
   */
  async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryInput = (req.validated?.query as any) || req.query || {};
      const result = await ordersService.getOrders(queryInput, req.user);

      res.json({
        status: "success",
        data: result.orders,
        pagination: result.pagination,
        summary: result.summary,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders/summary (and /api/orders/metrics)
   * Dashboard summary metrics including total orders, revenue, status and payment counts.
   */
  async getSummaryMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await ordersService.getSummaryMetrics();
      res.json({
        status: "success",
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders/:id
   * Complete order details with patient, medicines, prescription, delivery, and payment info.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String((req.validated?.params as any)?.id || req.params["id"] || "").trim();
      if (!id || id === "undefined" || id === "null") {
        throw new BadRequestError("Valid order ID is required.");
      }

      const order = await ordersService.getOrderById(id, req.user);
      res.json({
        status: "success",
        data: order,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/orders/:id/status
   * Authorized admin status transition update with transition validation and audit logging.
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String((req.validated?.params as any)?.id || req.params["id"] || "").trim();
      const body = (req.validated?.body as any) || req.body || {};
      const status = body.status;

      if (!id || !status) {
        throw new BadRequestError("Order ID and new status are required.");
      }

      const result = await ordersService.updateOrderStatus(
        id,
        status,
        {
          cancellation_reason: body.cancellation_reason,
          reason: body.reason,
          note: body.note,
          notes: body.notes,
        },
        req.user,
      );

      res.json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders/my-orders
   * Patient app compatibility endpoint.
   */
  async getMyOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user_id = req.user?.id
        ? String(req.user.id)
        : typeof req.query["user_id"] === "string"
          ? req.query["user_id"]
          : undefined;
      const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;

      const orders = await ordersService.getMyOrders({ user_id, status }, req.user);
      res.json({
        status: "success",
        data: orders,
      });
    } catch (err) {
      next(err);
    }
  },
};
