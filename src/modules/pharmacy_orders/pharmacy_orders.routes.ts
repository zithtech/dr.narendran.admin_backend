import { Router } from "express";

import { PharmacyOrdersController } from "./pharmacy_orders.controller.js";

export const pharmacyOrdersRouter: Router = Router();

pharmacyOrdersRouter.get("/review", PharmacyOrdersController.getReviewOrderInfo);
pharmacyOrdersRouter.get("/my-orders", PharmacyOrdersController.getMyPharmacyOrders);
pharmacyOrdersRouter.get("/", PharmacyOrdersController.getMyPharmacyOrders);
pharmacyOrdersRouter.get("/:id", PharmacyOrdersController.getPharmacyOrderDetails);
pharmacyOrdersRouter.post("/", PharmacyOrdersController.createOrder);
