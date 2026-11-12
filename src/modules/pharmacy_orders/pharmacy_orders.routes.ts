import { type NextFunction, type Request, type Response, Router } from "express";

import { requireAuth } from "@/http/middleware/authenticate.js";
import { requirePermission } from "@/http/middleware/rbac.middleware.js";
import { validate } from "@/http/middleware/validate.js";
import { verifyAccessToken } from "@/modules/auth/tokens.js";
import { DeliveryController } from "@/modules/orders/delivery.controller.js";
import {
    compositeDeliverySchema,
    updateCourierSchema,
    updateDeliveryMethodSchema,
    updateDeliveryStatusSchema,
    updateEtaSchema,
    updatePharmacyDeliverySchema,
} from "@/modules/orders/delivery.schema.js";
import { OrdersController } from "@/modules/orders/orders.controller.js";
import {
    orderIdParamSchema,
    updateOrderStatusSchema,
} from "@/modules/orders/orders.schema.js";

import { PharmacyOrdersController } from "./pharmacy_orders.controller.js";

const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        try {
            const token = header.split(' ')[1];
            if (token) {
                const payload = verifyAccessToken(token);
                (req as any).user = { id: payload.sub, email: payload.email, role: payload.role };
            }
        } catch {
            // Ignore token verification errors for optional auth
        }
    }
    next();
};

export const pharmacyOrdersRouter: Router = Router();

pharmacyOrdersRouter.get("/review", PharmacyOrdersController.getReviewOrderInfo);
pharmacyOrdersRouter.get("/my-orders", PharmacyOrdersController.getMyPharmacyOrders);
pharmacyOrdersRouter.get("/", PharmacyOrdersController.getMyPharmacyOrders);
pharmacyOrdersRouter.get("/:id", PharmacyOrdersController.getPharmacyOrderDetails);
pharmacyOrdersRouter.post("/", optionalAuth, PharmacyOrdersController.createOrder);

// Allow status update via /api/pharmacy-orders/:id/status with same validation and auth
pharmacyOrdersRouter.patch(
    "/:id/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
    OrdersController.updateStatus,
);

// Delivery routes on pharmacy-orders
pharmacyOrdersRouter.get(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "read"),
    validate({ params: orderIdParamSchema }),
    DeliveryController.getDeliveryDetails,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery/method",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryMethodSchema }),
    DeliveryController.updateMethod,
);
pharmacyOrdersRouter.put(
    "/:id/delivery/method",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryMethodSchema }),
    DeliveryController.updateMethod,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery/courier",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateCourierSchema }),
    DeliveryController.updateCourier,
);
pharmacyOrdersRouter.put(
    "/:id/delivery/courier",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateCourierSchema }),
    DeliveryController.updateCourier,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery/pharmacy-delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updatePharmacyDeliverySchema }),
    DeliveryController.updatePharmacyDeliveryPerson,
);
pharmacyOrdersRouter.put(
    "/:id/delivery/pharmacy-delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updatePharmacyDeliverySchema }),
    DeliveryController.updatePharmacyDeliveryPerson,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery/eta",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateEtaSchema }),
    DeliveryController.updateEta,
);
pharmacyOrdersRouter.put(
    "/:id/delivery/eta",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateEtaSchema }),
    DeliveryController.updateEta,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryStatusSchema }),
    DeliveryController.updateStatus,
);
pharmacyOrdersRouter.put(
    "/:id/delivery/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryStatusSchema }),
    DeliveryController.updateStatus,
);
pharmacyOrdersRouter.patch(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: compositeDeliverySchema }),
    DeliveryController.updateComposite,
);
pharmacyOrdersRouter.put(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: compositeDeliverySchema }),
    DeliveryController.updateComposite,
);

