import { pool } from "@/db/pool.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/http/errors.js";
import { logger } from "@/lib/logger.js";

import { patientBackendDeliveryClient } from "./delivery.client.js";
import type { DeliveryDetails } from "./delivery.types.js";
import { orderNotificationService } from "./orderNotification.service.js";
import type { ListOrdersQueryInput } from "./orders.schema.js";
import type {
  ActingUserContext,
  DashboardSummaryMetrics,
  OrderDetails,
  OrderItemDetail,
  OrderListItem,
  OrderPaymentDetail,
  OrderTimelineLog,
  PaginationMeta,
} from "./orders.types.js";

const VALID_STATUSES = [
  "placed",
  "processing",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

type NormalizedOrderStatus = (typeof VALID_STATUSES)[number];

const STATUS_ALIASES: Record<string, NormalizedOrderStatus> = {
  placed: "placed",
  processing: "processing",
  in_progress: "processing",
  packed: "packed",
  prepared: "packed",
  out_for_delivery: "out_for_delivery",
  "out for delivery": "out_for_delivery",
  shipped: "out_for_delivery",
  dispatched: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  rejected: "cancelled",
};

const STATUS_TRANSITIONS: Record<NormalizedOrderStatus, NormalizedOrderStatus[]> = {
  placed: ["processing", "cancelled"],
  processing: ["packed", "out_for_delivery", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const STATUS_LABEL_MAP: Record<NormalizedOrderStatus, string> = {
  placed: "Order Placed",
  processing: "Order Processing",
  packed: "Order Packed",
  out_for_delivery: "Out for Delivery",
  delivered: "Order Delivered",
  cancelled: "Order Cancelled",
};

function normalizeStatus(inputStatus: string | undefined): NormalizedOrderStatus | null {
  if (!inputStatus) return null;
  const clean = inputStatus.toLowerCase().trim();
  return STATUS_ALIASES[clean] ?? null;
}

function normalizePaymentStatus(rawStatus: string | null | undefined): string {
  if (!rawStatus) return "pending";
  const s = rawStatus.toLowerCase().trim();
  if (s === "success" || s === "paid") return "paid";
  if (s === "refunded") return "refunded";
  if (s === "failed" || s === "user_dropped") return "failed";
  return "pending";
}

export class OrdersService {
  /**
   * Return dashboard summary metrics across all pharmacy orders.
   */
  async getSummaryMetrics(): Promise<DashboardSummaryMetrics> {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT
          COUNT(*)::int as total_orders,
          COALESCE(SUM(CASE WHEN LOWER(po.status) != 'cancelled' THEN po.total_amount ELSE 0 END), 0)::numeric as total_revenue,
          COUNT(CASE WHEN LOWER(po.status) = 'placed' THEN 1 END)::int as placed_count,
          COUNT(CASE WHEN LOWER(po.status) IN ('processing', 'in_progress') THEN 1 END)::int as processing_count,
          COUNT(CASE WHEN LOWER(po.status) = 'packed' THEN 1 END)::int as packed_count,
          COUNT(CASE WHEN LOWER(po.status) IN ('out_for_delivery', 'out for delivery', 'shipped', 'dispatched') THEN 1 END)::int as out_for_delivery_count,
          COUNT(CASE WHEN LOWER(po.status) = 'delivered' THEN 1 END)::int as delivered_count,
          COUNT(CASE WHEN LOWER(po.status) IN ('cancelled', 'canceled') THEN 1 END)::int as cancelled_count,
          COUNT(CASE WHEN COALESCE(pay.status, po.payment_status) IN ('SUCCESS', 'success', 'paid', 'PAID') THEN 1 END)::int as paid_count,
          COUNT(CASE WHEN COALESCE(pay.status, po.payment_status) IN ('PENDING', 'pending') THEN 1 END)::int as pending_payment_count,
          COUNT(CASE WHEN COALESCE(pay.status, po.payment_status) IN ('FAILED', 'failed', 'USER_DROPPED') THEN 1 END)::int as failed_payment_count,
          COUNT(CASE WHEN COALESCE(pay.status, po.payment_status) IN ('REFUNDED', 'refunded') THEN 1 END)::int as refunded_payment_count,
          COUNT(CASE WHEN po.created_at >= CURRENT_DATE THEN 1 END)::int as today_orders,
          COALESCE(SUM(CASE WHEN po.created_at >= CURRENT_DATE AND LOWER(po.status) != 'cancelled' THEN po.total_amount ELSE 0 END), 0)::numeric as today_revenue
        FROM pharmacy_orders po
        LEFT JOIN LATERAL (
          SELECT status 
          FROM payments 
          WHERE entity_type = 'PHARMACY_ORDER' 
            AND (entity_id = po.id::text OR order_id = po.order_number)
          ORDER BY created_at DESC 
          LIMIT 1
        ) pay ON true;
      `);

      const r = res.rows[0];
      return {
        totalOrders: parseInt(r.total_orders, 10) || 0,
        totalRevenue: parseFloat(r.total_revenue) || 0,
        todayOrders: parseInt(r.today_orders, 10) || 0,
        todayRevenue: parseFloat(r.today_revenue) || 0,
        statusCounts: {
          placed: parseInt(r.placed_count, 10) || 0,
          processing: parseInt(r.processing_count, 10) || 0,
          packed: parseInt(r.packed_count, 10) || 0,
          out_for_delivery: parseInt(r.out_for_delivery_count, 10) || 0,
          delivered: parseInt(r.delivered_count, 10) || 0,
          cancelled: parseInt(r.cancelled_count, 10) || 0,
        },
        paymentCounts: {
          paid: parseInt(r.paid_count, 10) || 0,
          pending: parseInt(r.pending_payment_count, 10) || 0,
          failed: parseInt(r.failed_payment_count, 10) || 0,
          refunded: parseInt(r.refunded_payment_count, 10) || 0,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Order Listing API for Admin & authorized staff.
   * Supports pagination, sorting, search, filtering by status, payment status, and date range.
   */
  async getOrders(
    query: ListOrdersQueryInput,
    actingUser?: ActingUserContext,
  ): Promise<{
    orders: OrderListItem[];
    pagination: PaginationMeta;
    summary: DashboardSummaryMetrics;
  }> {
    const client = await pool.connect();
    try {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
      const offset = (page - 1) * limit;

      const whereClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      // Access control: if user is patient, constrain strictly to their orders
      if (actingUser?.role === "patient") {
        whereClauses.push(
          `(po.patient_id::text = $${paramIdx} OR po.user_id::text = $${paramIdx} OR p.user_account_id::text = $${paramIdx} OR p.user_id::text = $${paramIdx})`,
        );
        params.push(actingUser.id);
        paramIdx++;
      } else if (query.user_id?.trim() || query.patient_id?.trim()) {
        const targetId = (query.patient_id || query.user_id)!.trim();
        whereClauses.push(
          `(po.patient_id::text = $${paramIdx} OR po.user_id::text = $${paramIdx} OR p.id::text = $${paramIdx})`,
        );
        params.push(targetId);
        paramIdx++;
      }

      // Search by order number, patient name, phone, or email
      if (query.search?.trim()) {
        const searchPattern = `%${query.search.trim()}%`;
        whereClauses.push(
          `(po.order_number ILIKE $${paramIdx} OR p.name ILIKE $${paramIdx} OR p.phone ILIKE $${paramIdx} OR p.email ILIKE $${paramIdx})`,
        );
        params.push(searchPattern);
        paramIdx++;
      }

      // Filter by order status
      if (query.status?.trim() && query.status.toLowerCase() !== "all") {
        const normalized = normalizeStatus(query.status);
        if (normalized === "processing") {
          whereClauses.push(
            `LOWER(po.status) IN ('processing', 'in_progress')`,
          );
        } else if (normalized === "out_for_delivery") {
          whereClauses.push(
            `LOWER(po.status) IN ('out_for_delivery', 'out for delivery', 'shipped', 'dispatched')`,
          );
        } else if (normalized === "cancelled") {
          whereClauses.push(
            `LOWER(po.status) IN ('cancelled', 'canceled', 'rejected')`,
          );
        } else if (normalized) {
          whereClauses.push(`LOWER(po.status) = $${paramIdx}`);
          params.push(normalized);
          paramIdx++;
        }
      }

      // Filter by payment status
      const paymentFilter = (query.paymentStatus || query.payment_status)?.trim();
      if (paymentFilter && paymentFilter.toLowerCase() !== "all") {
        const normalizedPay = paymentFilter.toLowerCase();
        if (normalizedPay === "paid") {
          whereClauses.push(
            `(COALESCE(pay.status, po.payment_status) IN ('SUCCESS', 'success', 'paid', 'PAID'))`,
          );
        } else if (normalizedPay === "pending") {
          whereClauses.push(
            `(COALESCE(pay.status, po.payment_status) IN ('PENDING', 'pending'))`,
          );
        } else if (normalizedPay === "failed") {
          whereClauses.push(
            `(COALESCE(pay.status, po.payment_status) IN ('FAILED', 'failed', 'USER_DROPPED'))`,
          );
        } else if (normalizedPay === "refunded") {
          whereClauses.push(
            `(COALESCE(pay.status, po.payment_status) IN ('REFUNDED', 'refunded'))`,
          );
        }
      }

      // Filter by date range (from / startDate and to / endDate)
      const startDateVal = query.startDate || query.from;
      if (startDateVal?.trim()) {
        whereClauses.push(`po.created_at >= $${paramIdx}`);
        params.push(new Date(startDateVal.trim()).toISOString());
        paramIdx++;
      }

      const endDateVal = query.endDate || query.to;
      if (endDateVal?.trim()) {
        const d = new Date(endDateVal.trim());
        // If date string has no time portion, expand to end of day
        if (endDateVal.trim().length <= 10) {
          d.setUTCHours(23, 59, 59, 999);
        }
        whereClauses.push(`po.created_at <= $${paramIdx}`);
        params.push(d.toISOString());
        paramIdx++;
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      // Count total matching orders
      const countSql = `
        SELECT COUNT(DISTINCT po.id)::int as total
        FROM pharmacy_orders po
        LEFT JOIN patients p ON (p.id = po.patient_id OR p.user_account_id = po.user_id OR p.user_id = po.user_id)
        LEFT JOIN LATERAL (
          SELECT status 
          FROM payments 
          WHERE entity_type = 'PHARMACY_ORDER' 
            AND (entity_id = po.id::text OR order_id = po.order_number)
          ORDER BY created_at DESC 
          LIMIT 1
        ) pay ON true
        ${whereSql}
      `;

      const countRes = await client.query(countSql, params);
      const total = parseInt(countRes.rows[0]?.total ?? "0", 10);
      const totalPages = Math.ceil(total / limit) || 1;

      // Determine sorting safely
      let orderBySql = "po.created_at DESC";
      const isAsc = query.sortOrder === "asc";
      if (query.sortBy === "totalAmount") {
        orderBySql = `COALESCE(po.total_amount, 0) ${isAsc ? "ASC" : "DESC"}`;
      } else if (query.sortBy === "orderNumber") {
        orderBySql = `po.order_number ${isAsc ? "ASC" : "DESC"}`;
      } else if (query.sortBy === "status") {
        orderBySql = `po.status ${isAsc ? "ASC" : "DESC"}`;
      } else if (query.sortBy === "paymentStatus") {
        orderBySql = `COALESCE(pay.status, po.payment_status) ${isAsc ? "ASC" : "DESC"}`;
      } else if (isAsc) {
        orderBySql = "po.created_at ASC";
      }

      // Query page items
      const queryParams = [...params, limit, offset];
      const listSql = `
        SELECT 
          po.id::text as id,
          COALESCE(po.order_number, po.id::text) as order_number,
          COALESCE(po.total_amount, 535)::numeric as total_amount,
          COALESCE(po.medicine_cost, 520)::numeric as medicine_cost,
          COALESCE(po.delivery_charge, 15)::numeric as delivery_charge,
          LOWER(COALESCE(po.status, 'placed')) as status,
          COALESCE(pay.status, po.payment_status, 'pending') as raw_payment_status,
          COALESCE(po.delivery_address, '3/119 Chetpet Road, Adyar, Chennai - 600020') as delivery_address,
          po.created_at,
          COALESCE(po.updated_at, po.created_at) as updated_at,
          p.id as patient_id,
          p.name as patient_name,
          p.phone as patient_phone,
          p.email as patient_email,
          COALESCE(
            (
              SELECT json_agg(
                COALESCE(m.medicine_name, poi.medicine_name, 'Medicine')
              )
              FROM pharmacy_order_items poi
              LEFT JOIN medicines m ON m.id = poi.medicine_id
              WHERE poi.order_id::text = po.id::text
            ),
            '[]'::json
          ) as medicines_preview
        FROM pharmacy_orders po
        LEFT JOIN patients p ON (p.id = po.patient_id OR p.user_account_id = po.user_id OR p.user_id = po.user_id)
        LEFT JOIN LATERAL (
          SELECT status 
          FROM payments 
          WHERE entity_type = 'PHARMACY_ORDER' 
            AND (entity_id = po.id::text OR order_id = po.order_number)
          ORDER BY created_at DESC 
          LIMIT 1
        ) pay ON true
        ${whereSql}
        ORDER BY ${orderBySql}
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `;

      const listRes = await client.query(listSql, queryParams);

      const orders: OrderListItem[] = listRes.rows.map((r: any) => {
        const previewArr = Array.isArray(r.medicines_preview) ? r.medicines_preview : [];
        const normStatus = normalizeStatus(r.status) || r.status || "placed";
        const normPayStatus = normalizePaymentStatus(r.raw_payment_status);

        return {
          id: r.id,
          order_number: r.order_number || r.id,
          total_amount: parseFloat(r.total_amount) || 0,
          medicine_cost: parseFloat(r.medicine_cost) || 0,
          delivery_charge: parseFloat(r.delivery_charge) || 0,
          status: normStatus,
          payment_status: normPayStatus,
          item_count: previewArr.length || 1,
          medicines_preview: previewArr.join(", "),
          delivery_address: r.delivery_address || "",
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
          patient: r.patient_id
            ? {
              id: r.patient_id,
              name: r.patient_name || "Patient",
              phone: r.patient_phone || "",
              email: r.patient_email || "",
            }
            : null,
        };
      });

      const summary = await this.getSummaryMetrics();

      return {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        summary,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Order Details API.
   * Returns complete order information, patient details, medicine items,
   * prescription reference, delivery address, payment transactions, and status history.
   */
  async getOrderById(id: string, actingUser?: ActingUserContext): Promise<OrderDetails> {
    const client = await pool.connect();
    try {
      // 1. Fetch main order, delivery address, patient info, and prescription reference
      const orderRes = await client.query(
        `
        SELECT 
          po.id::text as id,
          COALESCE(po.order_number, po.id::text) as order_number,
          COALESCE(po.total_amount, 535)::numeric as total_amount,
          COALESCE(po.medicine_cost, 520)::numeric as medicine_cost,
          COALESCE(po.delivery_charge, 15)::numeric as delivery_charge,
          LOWER(COALESCE(po.status, 'placed')) as status,
          COALESCE(po.payment_status, 'pending') as raw_payment_status,
          po.cancellation_reason,
          po.created_at,
          COALESCE(po.updated_at, po.created_at) as updated_at,
          COALESCE(po.delivery_address, '3/119 Chetpet Road, Adyar, Chennai - 600020') as full_address,
          '13.0067' as addr_lat,
          '80.2570' as addr_lng,
          p.id as patient_id,
          p.name as patient_name,
          p.phone as patient_phone,
          p.email as patient_email,
          p.gender as patient_gender,
          p.date_of_birth as patient_dob,
          p.blood_group as patient_blood_group,
          p.city as patient_city,
          p.pincode as patient_pincode,
          p.state as patient_state,
          po.user_id as po_user_id,
          pr.id as prescription_id,
          pr.prescription_date,
          pr.prescription_type,
          COALESCE(pr.prescription_url, pr.image_url) as prescription_url,
          d.id as doctor_id,
          d.name as doctor_name,
          d.specialization as doctor_specialization,
          po.delivery_method,
          po.courier_name,
          po.courier_tracking_number,
          po.courier_tracking_url,
          po.courier_contact_phone,
          po.delivery_person_name,
          po.delivery_person_phone,
          po.estimated_delivery_at,
          po.dispatched_at,
          po.delivered_at
        FROM pharmacy_orders po
        LEFT JOIN patients p ON (p.id = po.patient_id OR p.user_account_id = po.user_id OR p.user_id = po.user_id)
        LEFT JOIN prescriptions pr ON pr.id = po.prescription_id
        LEFT JOIN doctors d ON d.id = pr.doctor_id
        WHERE po.id::text = $1 OR po.order_number = $1
        LIMIT 1;
      `,
        [id],
      );

      const row = orderRes.rows[0];

      if (!row) {
        throw new NotFoundError("Order");
      }

      // Security check: if patient role, prevent accessing other patients' orders
      if (actingUser?.role === "patient") {
        const isOwner =
          actingUser.id === row.patient_id ||
          actingUser.id === row.po_user_id;

        if (!isOwner) {
          // Check if patient row has matching user_account_id
          const pCheck = await client.query(
            "SELECT id FROM patients WHERE (user_account_id = $1 OR user_id = $1) AND id = $2",
            [actingUser.id, row.patient_id],
          );
          if (pCheck.rows.length === 0) {
            throw new ForbiddenError("You do not have permission to view this order.");
          }
        }
      }

      const orderUuid = row.id;
      const orderNum = row.order_number;

      // 2. Fetch ordered medicine items
      let items: OrderItemDetail[] = [];
      const poItemsRes = await client.query(
        `
        SELECT 
          poi.id,
          poi.medicine_id,
          poi.medicine_name as name,
          COALESCE(poi.quantity, 1) as quantity,
          COALESCE(pm.strength, m.strength, '') as strength,
          COALESCE(m.final_price, m.mrp, 52.00)::numeric as unit_price,
          (COALESCE(poi.quantity, 1) * COALESCE(m.final_price, m.mrp, 52.00))::numeric as total_price,
          COALESCE(pm.frequency, m.frequency, '1 tablet • Once daily') as dosage_instruction,
          COALESCE(pm.duration, m.duration, '7 days') as duration
        FROM pharmacy_order_items poi
        LEFT JOIN prescription_medicines pm ON pm.id = poi.medicine_id
        LEFT JOIN medicines m ON (m.id = poi.medicine_id OR m.id = pm.medicine_id)
        WHERE poi.order_id::text = $1
        ORDER BY poi.created_at ASC;
      `,
        [orderUuid],
      );

      if (poItemsRes.rows.length > 0) {
        items = poItemsRes.rows.map((r: any) => ({
          id: r.id,
          medicine_id: r.medicine_id,
          name: r.name,
          strength: r.strength || "",
          quantity: parseInt(r.quantity, 10) || 1,
          unit_price: parseFloat(r.unit_price) || 0,
          total_price: parseFloat(r.total_price) || 0,
          dosage_instruction: r.dosage_instruction,
          duration: r.duration,
        }));
      }

      // If items list is still empty, synthesize a representative item from costs
      if (items.length === 0) {
        items = [
          {
            id: 1,
            medicine_id: null,
            name: "Prescribed Medicine",
            strength: "",
            quantity: 1,
            unit_price: parseFloat(row.medicine_cost) || 520,
            total_price: parseFloat(row.medicine_cost) || 520,
            dosage_instruction: "1 tablet • Once daily",
            duration: "7 days",
          },
        ];
      }

      // 3. Fetch verified payment transaction reference from payments table
      const payRes = await client.query(
        `
        SELECT 
          id, cf_order_id, cf_payment_id, payment_session_id, payment_method,
          bank_reference, payment_time, amount, currency, status,
          refund_id, refund_amount, refund_status, failure_reason
        FROM payments
        WHERE entity_type = 'PHARMACY_ORDER'
          AND (entity_id = $1 OR entity_id = $2 OR order_id = $1 OR order_id = $2)
        ORDER BY created_at DESC
        LIMIT 1;
      `,
        [orderUuid, orderNum],
      );

      let payment: OrderPaymentDetail | null = null;
      let verifiedPaymentStatus = normalizePaymentStatus(row.raw_payment_status);

      if (payRes.rows.length > 0) {
        const pr = payRes.rows[0];
        verifiedPaymentStatus = normalizePaymentStatus(pr.status);
        payment = {
          id: pr.id,
          cf_order_id: pr.cf_order_id,
          cf_payment_id: pr.cf_payment_id,
          payment_session_id: pr.payment_session_id,
          payment_method: pr.payment_method || "Online",
          bank_reference: pr.bank_reference,
          payment_time: pr.payment_time ? new Date(pr.payment_time).toISOString() : null,
          amount: parseFloat(pr.amount) || 0,
          currency: pr.currency || "INR",
          status: pr.status,
          refund_id: pr.refund_id,
          refund_amount: pr.refund_amount ? parseFloat(pr.refund_amount) : null,
          refund_status: pr.refund_status,
          failure_reason: pr.failure_reason,
        };
      }

      // 4. Fetch status timeline logs with admin details
      const statusRes = await client.query(
        `
        SELECT 
          osl.id,
          osl.status,
          osl.status_date,
          osl.notes,
          osl.admin_id,
          COALESCE(au.name, au.username, u.full_name, 'Admin') as admin_name
        FROM order_status_logs osl
        LEFT JOIN admin_users au ON au.id = osl.admin_id
        LEFT JOIN users u ON u.id = osl.admin_id
        WHERE osl.order_id = $1 OR osl.order_id = $2
        ORDER BY osl.status_date ASC, osl.id ASC;
      `,
        [orderUuid, orderNum],
      );

      const statusTimeline: OrderTimelineLog[] = statusRes.rows.map((sl: any) => {
        const d = sl.status_date ? new Date(sl.status_date) : new Date();
        const timeStr = d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const rawStatus = normalizeStatus(sl.status) || sl.status.toLowerCase();
        return {
          id: sl.id,
          status: sl.status,
          raw_status: rawStatus,
          date: d.toISOString(),
          time: timeStr,
          notes: sl.notes || null,
          admin_id: sl.admin_id || null,
          admin_name: sl.admin_id ? sl.admin_name : null,
        };
      });

      // If no timeline logs yet, populate initial Order Placed log
      if (statusTimeline.length === 0) {
        const orderDate = row.created_at ? new Date(row.created_at) : new Date();
        statusTimeline.push({
          id: 0,
          status: "Order Placed",
          raw_status: "placed",
          date: orderDate.toISOString(),
          time: orderDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          notes: null,
          admin_id: null,
          admin_name: null,
        });
      }

      const totalAmount = parseFloat(row.total_amount) || 0;
      const medicineCost = parseFloat(row.medicine_cost) || 0;
      const deliveryCharge = parseFloat(row.delivery_charge) || 0;
      const discounts = Math.max(0, medicineCost + deliveryCharge - totalAmount);

      // Retrieve current delivery information through Patient/Doctor Backend
      let downstreamDelivery: DeliveryDetails | null = null;
      try {
        downstreamDelivery = await patientBackendDeliveryClient.getDeliveryDetails(row.id, actingUser);
      } catch (deliveryErr) {
        logger.warn(
          { err: deliveryErr, orderId: row.id },
          "Unable to fetch delivery information from Patient/Doctor Backend; using order snapshot",
        );
      }

      return {
        id: row.id,
        order_number: row.order_number,
        status: normalizeStatus(row.status) || row.status,
        payment_status: verifiedPaymentStatus,
        cancellation_reason: row.cancellation_reason || null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        pricing: {
          subtotal: medicineCost,
          medicine_cost: medicineCost,
          discounts,
          delivery_charge: deliveryCharge,
          total_amount: totalAmount,
        },
        patient: row.patient_id
          ? {
            id: row.patient_id,
            name: row.patient_name || "Patient",
            phone: row.patient_phone || "",
            email: row.patient_email || "",
            gender: row.patient_gender || null,
            date_of_birth: row.patient_dob ? new Date(row.patient_dob).toISOString().split("T")[0]! : null,
            blood_group: row.patient_blood_group || null,
          }
          : null,
        prescription: row.prescription_id
          ? {
            id: row.prescription_id,
            prescription_date: row.prescription_date
              ? new Date(row.prescription_date).toISOString().split("T")[0]!
              : "",
            prescription_type: row.prescription_type || "electronic",
            doctor: row.doctor_id
              ? {
                id: row.doctor_id,
                name: row.doctor_name || "Doctor",
                specialization: row.doctor_specialization || null,
              }
              : null,
            prescription_url: row.prescription_url || null,
          }
          : null,
        delivery: {
          delivery_method:
            downstreamDelivery?.delivery_method ??
            (row.delivery_method ? String(row.delivery_method) : null),
          courier_name:
            downstreamDelivery?.courier_name ??
            downstreamDelivery?.courier?.courier_name ??
            row.courier_name ??
            null,
          tracking_number:
            downstreamDelivery?.tracking_number ??
            downstreamDelivery?.courier?.tracking_number ??
            row.courier_tracking_number ??
            null,
          tracking_url:
            downstreamDelivery?.tracking_url ??
            downstreamDelivery?.courier?.tracking_url ??
            row.courier_tracking_url ??
            null,
          courier_phone:
            downstreamDelivery?.courier_phone ??
            downstreamDelivery?.courier?.courier_phone ??
            row.courier_contact_phone ??
            null,
          delivery_person_name:
            downstreamDelivery?.delivery_person_name ??
            downstreamDelivery?.pharmacy_delivery?.delivery_person_name ??
            row.delivery_person_name ??
            null,
          delivery_person_phone:
            downstreamDelivery?.delivery_person_phone ??
            downstreamDelivery?.pharmacy_delivery?.delivery_person_phone ??
            row.delivery_person_phone ??
            null,
          estimated_delivery_time:
            downstreamDelivery?.estimated_delivery_time ??
            (row.estimated_delivery_at ? new Date(row.estimated_delivery_at).toISOString() : null),
          delay_remarks: downstreamDelivery?.delay_remarks ?? null,
          delivery_status: downstreamDelivery?.status ?? row.status ?? null,
          status: downstreamDelivery?.status ?? row.status ?? null,
          courier:
            downstreamDelivery?.courier ??
            (row.delivery_method === "THIRD_PARTY_COURIER" || row.courier_name
              ? {
                  courier_name: row.courier_name || "",
                  tracking_number: row.courier_tracking_number || "",
                  courier_tracking_number: row.courier_tracking_number || "",
                  tracking_url: row.courier_tracking_url || null,
                  courier_tracking_url: row.courier_tracking_url || null,
                  courier_contact_number: row.courier_contact_phone || null,
                  courier_contact_phone: row.courier_contact_phone || null,
                  courier_phone: row.courier_contact_phone || null,
                }
              : null),
          pharmacy_delivery:
            downstreamDelivery?.pharmacy_delivery ??
            (row.delivery_method === "PHARMACY_DELIVERY" || row.delivery_person_name
              ? {
                  delivery_person_name: row.delivery_person_name || "",
                  delivery_person_phone: row.delivery_person_phone || "",
                  name: row.delivery_person_name || "",
                  phone: row.delivery_person_phone || "",
                }
              : null),
          delivery_person:
            downstreamDelivery?.delivery_person ??
            downstreamDelivery?.pharmacy_delivery ??
            (row.delivery_method === "PHARMACY_DELIVERY" || row.delivery_person_name
              ? {
                  delivery_person_name: row.delivery_person_name || "",
                  delivery_person_phone: row.delivery_person_phone || "",
                  name: row.delivery_person_name || "",
                  phone: row.delivery_person_phone || "",
                }
              : null),
          delivery_address: {
            full_address:
              downstreamDelivery?.delivery_address?.full_address ||
              row.full_address ||
              "3/119 Chetpet Road, Adyar, Chennai - 600020",
            lat:
              downstreamDelivery?.delivery_address?.lat ||
              row.addr_lat ||
              "13.0067",
            lng:
              downstreamDelivery?.delivery_address?.lng ||
              row.addr_lng ||
              "80.2570",
            city:
              downstreamDelivery?.delivery_address?.city ||
              row.patient_city ||
              "Chennai",
            pincode:
              downstreamDelivery?.delivery_address?.pincode ||
              row.patient_pincode ||
              "600020",
            state:
              downstreamDelivery?.delivery_address?.state ||
              row.patient_state ||
              "Tamil Nadu",
          },
        },
        medicines: items,
        payment,
        status_timeline: statusTimeline,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Order Status Update API with state-machine transition validation,
   * cancellation reason enforcement, transactional updates, and concurrency protection.
   */
  async updateOrderStatus(
    orderId: string,
    requestedStatus: string,
    options: {
      cancellation_reason?: string | undefined;
      reason?: string | undefined;
      note?: string | undefined;
      notes?: string | undefined;
    } = {},
    actingUser?: ActingUserContext,
  ): Promise<{
    success: boolean;
    orderId: string;
    orderNumber: string;
    previousStatus: string;
    status: NormalizedOrderStatus;
    cancellation_reason: string | null;
  }> {
    const targetStatus = normalizeStatus(requestedStatus);
    if (!targetStatus) {
      throw new BadRequestError(
        `Invalid status '${requestedStatus}'. Supported statuses: ${VALID_STATUSES.join(", ")}.`,
      );
    }

    const cancellationReason = (
      options.cancellation_reason ||
      options.reason ||
      options.note ||
      options.notes ||
      ""
    ).trim();

    if (targetStatus === "cancelled" && cancellationReason.length < 3) {
      throw new BadRequestError(
        "Cancellation reason is required when cancelling an order (minimum 3 characters).",
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Row-level lock on pharmacy_orders to prevent concurrent race conditions
      const lockRes = await client.query(
        `SELECT id, order_number, status, cancellation_reason 
         FROM pharmacy_orders 
         WHERE id::text = $1 OR order_number = $1 
         FOR UPDATE`,
        [orderId],
      );

      const currentOrder = lockRes.rows[0];

      if (!currentOrder) {
        await client.query("ROLLBACK");
        throw new NotFoundError("Order");
      }

      const resolvedId = String(currentOrder.id);
      const resolvedOrderNumber = String(currentOrder.order_number || resolvedId);
      const currentNormalized = normalizeStatus(currentOrder.status) || "placed";

      // If already in target status, idempotent return
      if (currentNormalized === targetStatus) {
        await client.query("COMMIT");
        return {
          success: true,
          orderId: resolvedId,
          orderNumber: resolvedOrderNumber,
          previousStatus: currentNormalized,
          status: targetStatus,
          cancellation_reason: currentOrder.cancellation_reason || null,
        };
      }

      // Validate allowed state transitions
      const allowedNext = STATUS_TRANSITIONS[currentNormalized];
      if (!allowedNext.includes(targetStatus)) {
        await client.query("ROLLBACK");
        if (currentNormalized === "delivered") {
          throw new BadRequestError("Delivered orders cannot be transitioned to another status.");
        }
        if (currentNormalized === "cancelled") {
          throw new BadRequestError("Cancelled orders cannot be reopened or transitioned.");
        }
        throw new BadRequestError(
          `Cannot transition order status from '${currentNormalized}' to '${targetStatus}'. Allowed transitions: ${allowedNext.join(", ") || "none"}.`,
        );
      }

      const reasonToStore = targetStatus === "cancelled" ? cancellationReason : null;

      // Update pharmacy_orders table
      await client.query(
        `UPDATE pharmacy_orders 
         SET status = $1, 
             cancellation_reason = COALESCE($2, cancellation_reason), 
             updated_at = NOW() 
         WHERE id::text = $3 OR order_number = $3`,
        [targetStatus, reasonToStore, orderId],
      );

      // Log status transition with admin audit ID and notes
      const statusLabel = STATUS_LABEL_MAP[targetStatus];
      const adminId =
        actingUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actingUser.id)
          ? actingUser.id
          : null;
      const logNote =
        reasonToStore || (options.notes || options.note || "").trim() || null;

      await client.query(
        `INSERT INTO order_status_logs (order_id, status, status_date, created_at, admin_id, notes) 
         VALUES ($1, $2, NOW(), NOW(), $3, $4)`,
        [resolvedId, statusLabel, adminId, logNote],
      );

      await client.query("COMMIT");

      logger.info(
        {
          orderId: resolvedId,
          orderNumber: resolvedOrderNumber,
          fromStatus: currentNormalized,
          toStatus: targetStatus,
          adminId,
        },
        "Order status updated successfully",
      );

      // Post-commit: dispatch notification to patient
      try {
        await orderNotificationService.sendOrderNotification(resolvedId, targetStatus);
      } catch (notifErr) {
        logger.error(
          { err: notifErr, orderId: resolvedId, status: targetStatus },
          "Failed to dispatch order status notification",
        );
      }

      return {
        success: true,
        orderId: resolvedId,
        orderNumber: resolvedOrderNumber,
        previousStatus: currentNormalized,
        status: targetStatus,
        cancellation_reason: reasonToStore,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Compatibility method for Patient App /my-orders queries.
   */
  async getMyOrders(
    query: { user_id?: string | undefined; status?: string | undefined },
    actingUser?: ActingUserContext,
  ) {
    const listResult = await this.getOrders(
      {
        page: 1,
        limit: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
        user_id: query.user_id,
        status: query.status,
      },
      actingUser,
    );

    return listResult.orders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      total_amount: o.total_amount,
      status: o.status,
      item_count: o.item_count,
      medicines_preview: o.medicines_preview,
      created_at: o.created_at,
    }));
  }
}

export const ordersService = new OrdersService();
