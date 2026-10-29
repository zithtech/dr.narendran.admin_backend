import { Router } from "express";

import { OrdersController } from "./orders.controller.js";

export const ordersRouter: Router = Router();

ordersRouter.get("/my-orders", OrdersController.getMyOrders);
ordersRouter.get("/", OrdersController.getOrders);
ordersRouter.get("/:id", OrdersController.getById);
ordersRouter.patch("/:id/status", OrdersController.updateStatus);
