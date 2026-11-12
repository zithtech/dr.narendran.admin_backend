import { Router } from "express";

import { requireAuth } from "@/http/middleware/authenticate.js";
import {
    requirePermission,
    requirePermissionOrPatient,
} from "@/http/middleware/rbac.middleware.js";
import { validate } from "@/http/middleware/validate.js";

import { DeliveryController } from "./delivery.controller.js";
import {
    compositeDeliverySchema,
    updateCourierSchema,
    updateDeliveryMethodSchema,
    updateDeliveryStatusSchema,
    updateEtaSchema,
    updatePharmacyDeliverySchema,
} from "./delivery.schema.js";
import { OrdersController } from "./orders.controller.js";
import {
    listOrdersQuerySchema,
    orderIdParamSchema,
    updateOrderStatusSchema,
} from "./orders.schema.js";

export const ordersRouter: Router = Router();

// 1. Patient App /my-orders route
ordersRouter.get("/my-orders", requireAuth, OrdersController.getMyOrders);

// 2. Summary & metrics dashboard routes (Declared BEFORE :id route to prevent shadowing)
ordersRouter.get(
    "/summary",
    requireAuth,
    requirePermission("ORDERS", "read"),
    OrdersController.getSummaryMetrics,
);
ordersRouter.get(
    "/metrics",
    requireAuth,
    requirePermission("ORDERS", "read"),
    OrdersController.getSummaryMetrics,
);

// 3. Orders listing route with query validation
ordersRouter.get(
    "/",
    requireAuth,
    requirePermission("ORDERS", "read"),
    validate({ query: listOrdersQuerySchema }),
    OrdersController.getOrders,
);

// 4. Order Details route with param validation
ordersRouter.get(
    "/:id",
    requireAuth,
    requirePermissionOrPatient("ORDERS", "read"),
    validate({ params: orderIdParamSchema }),
    OrdersController.getById,
);

// 5. Order status update route with body & param validation
ordersRouter.patch(
    "/:id/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
    OrdersController.updateStatus,
);

// =========================================================================
// 6. Admin Delivery Management APIs
// =========================================================================

// Retrieve current delivery details
ordersRouter.get(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "read"),
    validate({ params: orderIdParamSchema }),
    DeliveryController.getDeliveryDetails,
);

// Update delivery method: THIRD_PARTY_COURIER or PHARMACY_DELIVERY
ordersRouter.patch(
    "/:id/delivery/method",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryMethodSchema }),
    DeliveryController.updateMethod,
);
ordersRouter.put(
    "/:id/delivery/method",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryMethodSchema }),
    DeliveryController.updateMethod,
);

// Update courier details (name, tracking number, URL, contact)
ordersRouter.patch(
    "/:id/delivery/courier",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateCourierSchema }),
    DeliveryController.updateCourier,
);
ordersRouter.put(
    "/:id/delivery/courier",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateCourierSchema }),
    DeliveryController.updateCourier,
);

// Update pharmacy delivery person details (name, phone)
ordersRouter.patch(
    "/:id/delivery/pharmacy-delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updatePharmacyDeliverySchema }),
    DeliveryController.updatePharmacyDeliveryPerson,
);
ordersRouter.put(
    "/:id/delivery/pharmacy-delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updatePharmacyDeliverySchema }),
    DeliveryController.updatePharmacyDeliveryPerson,
);
ordersRouter.patch(
    "/:id/delivery/delivery-person",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updatePharmacyDeliverySchema }),
    DeliveryController.updatePharmacyDeliveryPerson,
);

// Update estimated delivery time (ETA)
ordersRouter.patch(
    "/:id/delivery/eta",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateEtaSchema }),
    DeliveryController.updateEta,
);
ordersRouter.put(
    "/:id/delivery/eta",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateEtaSchema }),
    DeliveryController.updateEta,
);

// Update delivery status
ordersRouter.patch(
    "/:id/delivery/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryStatusSchema }),
    DeliveryController.updateStatus,
);
ordersRouter.put(
    "/:id/delivery/status",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: updateDeliveryStatusSchema }),
    DeliveryController.updateStatus,
);

// Composite / batch delivery details update
ordersRouter.patch(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: compositeDeliverySchema }),
    DeliveryController.updateComposite,
);
ordersRouter.put(
    "/:id/delivery",
    requireAuth,
    requirePermission("ORDERS", "update"),
    validate({ params: orderIdParamSchema, body: compositeDeliverySchema }),
    DeliveryController.updateComposite,
);

