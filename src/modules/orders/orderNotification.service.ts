import { pool } from "@/db/pool.js";
import { logger } from "@/lib/logger.js";
import { notificationService } from "@/modules/notifications/notification.service.js";
import { NotificationType } from "@/modules/notifications/notification.types.js";

export interface OrderNotificationOptions {
  paymentStatus?: string;
}

export class OrderNotificationService {
  /**
   * Dispatches an authoritative order state change notification to the patient.
   * Generates a stable idempotencyKey to prevent duplicate sends across webhook retries.
   */
  async sendOrderNotification(
    orderId: string,
    status: string,
    options?: OrderNotificationOptions,
  ): Promise<{ sent: boolean; reason?: string }> {
    const client = await pool.connect();
    try {
      // 1. Fetch order details from pharmacy_orders or orders
      let orderRes = await client.query(
        `SELECT id::text as id, order_number, user_id::text as user_id, patient_id::text as patient_id, status 
         FROM pharmacy_orders 
         WHERE id::text = $1 OR order_number = $1 
         LIMIT 1`,
        [orderId],
      );

      let order = orderRes.rows[0];

      if (!order) {
        orderRes = await client.query(
          `SELECT id::text as id, order_number, user_id::text as user_id, NULL as patient_id, status 
           FROM orders 
           WHERE id::text = $1 OR order_number = $1 
           LIMIT 1`,
          [orderId],
        );
        order = orderRes.rows[0];
      }

      if (!order) {
        logger.warn({ orderId }, "[OrderNotification] Order not found for notification dispatch");
        return { sent: false, reason: "Order not found" };
      }

      // 2. Resolve recipient patient user_account_id
      let recipientUserId: string | null = null;
      if (order.patient_id) {
        recipientUserId = await notificationService.resolveUserAccountForPatient(order.patient_id);
      }
      if (!recipientUserId && order.user_id) {
        recipientUserId = order.user_id;
      }

      if (!recipientUserId) {
        logger.warn(
          { orderId: order.id, patientId: order.patient_id, userId: order.user_id },
          "[OrderNotification] Could not resolve recipient user_account_id for order notification",
        );
        return { sent: false, reason: "No recipient resolved" };
      }

      const orderNumber = order.order_number || `#${order.id.slice(0, 8)}`;
      const normalizedStatus = (status || order.status || "").toLowerCase().trim();

      // 3. Map status and paymentStatus to authoritative notification content
      let notifType: NotificationType;
      let title: string;
      let body: string;

      if (options?.paymentStatus === "refunded") {
        notifType = NotificationType.MEDICINE_ORDER_REFUNDED;
        title = "Order Refund Processed";
        body = `A refund for medicine order ${orderNumber} has been initiated.`;
      } else {
        switch (normalizedStatus) {
          case "placed":
          case "order placed":
            notifType = NotificationType.MEDICINE_ORDER_CONFIRMED;
            title = "Order Placed Successfully";
            body = `Your medicine order ${orderNumber} has been placed successfully.`;
            break;
          case "processing":
          case "accepted":
          case "prepared":
          case "in_progress":
            notifType = NotificationType.MEDICINE_ORDER_PROCESSING;
            title = "Order Being Prepared";
            body = `Your medicine order ${orderNumber} is being prepared by the pharmacy.`;
            break;
          case "out_for_delivery":
          case "out for delivery":
          case "dispatched":
          case "shipped":
            notifType = NotificationType.MEDICINE_ORDER_SHIPPED;
            title = "Order Out for Delivery";
            body = `Your medicine order ${orderNumber} is on the way to your delivery address.`;
            break;
          case "delivered":
            notifType = NotificationType.MEDICINE_ORDER_DELIVERED;
            title = "Order Delivered";
            body = `Your medicine order ${orderNumber} has been delivered.`;
            break;
          case "cancelled":
          case "canceled":
          case "rejected":
            notifType = NotificationType.MEDICINE_ORDER_CANCELLED;
            title = "Order Cancelled";
            body = `Your medicine order ${orderNumber} has been cancelled.`;
            break;
          default:
            notifType = NotificationType.MEDICINE_ORDER_CONFIRMED;
            title = "Order Update";
            body = `Your medicine order ${orderNumber} status is now ${status}.`;
            break;
        }
      }

      // Stable idempotency key: ensures webhook retries & repeated status events do not send duplicates
      const eventKeySuffix = options?.paymentStatus === "refunded" ? "payment:refunded" : `status:${normalizedStatus}`;
      const idempotencyKey = `order:${order.id}:${eventKeySuffix}`;

      // Construct payload: Keep database ID separate from human-readable order number.
      // Do not include payment credentials or unnecessary medical details.
      const payload = {
        type: notifType,
        title,
        body,
        entityType: "ORDER",
        entityId: order.id,
        route: "OrderDetails",
        idempotencyKey,
        data: {
          orderId: order.id,
          orderNumber,
          status: normalizedStatus,
          screen: "OrderDetails",
          type: notifType,
        },
      };

      logger.info(
        { recipientUserId, orderId: order.id, orderNumber, notifType, idempotencyKey },
        "[OrderNotification] Sending order notification",
      );

      await notificationService.sendToUser(recipientUserId, payload, {
        saveInApp: true,
        appType: "PATIENT",
      });

      return { sent: true };
    } catch (err: any) {
      logger.error(
        { orderId, status, error: err?.message || String(err) },
        "[OrderNotification] Failed to dispatch order notification",
      );
      return { sent: false, reason: err?.message || String(err) };
    } finally {
      client.release();
    }
  }
}

export const orderNotificationService = new OrderNotificationService();
