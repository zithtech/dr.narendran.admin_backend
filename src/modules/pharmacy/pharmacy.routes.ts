import { Router } from "express";

import { PharmacyController } from "./pharmacy.controller.js";

export const pharmacyRouter: Router = Router();

pharmacyRouter.get("/orders/my-orders", PharmacyController.getMyPharmacyOrders);
pharmacyRouter.get("/orders", PharmacyController.getMyPharmacyOrders);
pharmacyRouter.post("/orders", PharmacyController.createOrder);
pharmacyRouter.get("/orders/:id", PharmacyController.getOrderById);

pharmacyRouter.patch("/orders/:id/status", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { status, note } = req.body || {};
    if (!id || !status) {
      res.status(400).json({ error: "Order ID and status are required" });
      return;
    }
    const { ordersService } = await import("../orders/orders.service.js");
    const result = await ordersService.updateOrderStatus(id, status, { note });
    res.json({ status: "success", data: result });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update order status", details: err.message });
  }
});
