import { pool } from "@/db/pool.js";
import { orderNotificationService } from "./orderNotification.service.js";
import { logger } from "@/lib/logger.js";


export class OrdersService {
  async getMyOrders(query: { user_id?: string | undefined; status?: string | undefined }) {
    const client = await pool.connect();
    try {
      const whereClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (query.user_id && query.user_id.trim() !== "") {
        whereClauses.push(`(o.user_id IS NULL OR o.user_id::text = $${paramIdx})`);
        params.push(String(query.user_id));
        paramIdx++;
      }

      if (query.status && query.status.trim() !== "" && query.status.toLowerCase() !== "all") {
        const statusClean = query.status.toLowerCase().trim();
        if (statusClean === "processing") {
          whereClauses.push(`LOWER(o.status) IN ('processing', 'placed', 'out_for_delivery', 'out for delivery', 'in_progress')`);
        } else if (statusClean === "delivered") {
          whereClauses.push(`LOWER(o.status) = 'delivered'`);
        } else if (statusClean === "cancelled") {
          whereClauses.push(`LOWER(o.status) IN ('cancelled', 'canceled')`);
        } else {
          whereClauses.push(`LOWER(o.status) = $${paramIdx}`);
          params.push(statusClean);
          paramIdx++;
        }
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const querySql = `
        SELECT 
          o.id,
          COALESCE(o.order_number, o.id) as order_number,
          o.total_amount,
          o.status,
          o.created_at,
          COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        ${whereSql}
        GROUP BY o.id, o.order_number, o.total_amount, o.status, o.created_at
        ORDER BY o.created_at DESC
      `;

      const res = await client.query(querySql, params);

      const result = [];
      for (const row of res.rows) {
        const medsRes = await client.query(`
          SELECT COALESCE(m.medicine_name, oi.dosage_instruction, 'Medicine') as name
          FROM order_items oi
          LEFT JOIN medicines m ON oi.medicine_id = m.id
          WHERE oi.order_id = $1
          ORDER BY oi.id ASC
          LIMIT 2
        `, [row.id]);

        const medNames = medsRes.rows.map((r: any) => r.name);
        const previewStr = medNames.join(", ");

        result.push({
          id: row.id,
          order_number: row.order_number || row.id,
          total_amount: parseFloat(row.total_amount) || 0,
          status: (row.status || "placed").toLowerCase(),
          item_count: parseInt(row.item_count, 10) || medNames.length || 1,
          medicines_preview: previewStr,
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        });
      }

      return result;
    } finally {
      client.release();
    }
  }

  async getOrders(query: { user_id?: string | undefined; status?: string | undefined; page?: number | undefined; limit?: number | undefined }) {
    const client = await pool.connect();
    try {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Number(query.limit) || 10);
      const offset = (page - 1) * limit;

      const whereClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (query.user_id && query.user_id.trim() !== "") {
        whereClauses.push(`(o.user_id IS NULL OR o.user_id::text = $${paramIdx})`);
        params.push(String(query.user_id));
        paramIdx++;
      }

      if (query.status && query.status.trim() !== "" && query.status.toLowerCase() !== "all") {
        const statusClean = query.status.toLowerCase().trim();
        if (statusClean === "processing") {
          whereClauses.push(`LOWER(o.status) IN ('processing', 'placed', 'out_for_delivery', 'out for delivery', 'in_progress')`);
        } else if (statusClean === "delivered") {
          whereClauses.push(`LOWER(o.status) = 'delivered'`);
        } else if (statusClean === "cancelled") {
          whereClauses.push(`LOWER(o.status) IN ('cancelled', 'canceled')`);
        } else {
          whereClauses.push(`LOWER(o.status) = $${paramIdx}`);
          params.push(statusClean);
          paramIdx++;
        }
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const querySql = `
        SELECT 
          o.id,
          COALESCE(o.order_number, o.id) as order_number,
          o.total_amount,
          o.status,
          o.created_at,
          COALESCE(
            (
              SELECT json_agg(
                COALESCE(m.medicine_name, oi.dosage_instruction, 'Medicine')
              )
              FROM order_items oi
              LEFT JOIN medicines m ON oi.medicine_id = m.id
              WHERE oi.order_id = o.id
            ),
            '[]'::json
          ) as medicines_preview
        FROM orders o
        ${whereSql}
        ORDER BY o.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
      `;

      params.push(limit, offset);

      const res = await client.query(querySql, params);

      const dbOrders = res.rows.map((r: any) => {
        const preview = Array.isArray(r.medicines_preview) ? r.medicines_preview : [];
        return {
          id: r.id,
          order_number: r.order_number || r.id,
          total_amount: parseFloat(r.total_amount) || 0,
          status: (r.status || "placed").toLowerCase(),
          item_count: preview.length,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          medicines_preview: preview.join(", ")
        };
      });

      return dbOrders;
    } finally {
      client.release();
    }
  }

  async getOrderById(id: string) {
    const client = await pool.connect();
    try {
      // 1. Fetch main order and address details
      const orderRes = await client.query(`
        SELECT 
          o.id,
          o.order_number,
          o.total_amount,
          o.medicine_cost,
          o.delivery_charge,
          o.status,
          o.payment_status,
          o.created_at,
          a.full_address,
          a.lat,
          a.lng
        FROM orders o
        LEFT JOIN addresses a ON o.address_id = a.id
        WHERE o.id::text = $1 OR o.order_number = $1
      `, [id]);

      if (orderRes.rows.length === 0) {
        // Fallback check in pharmacy_orders if created via pharmacy checkout flow
        const rxOrderRes = await client.query(`
          SELECT * FROM pharmacy_orders WHERE id::text = $1 OR order_number = $1
        `, [id]);

        if (rxOrderRes.rows.length > 0) {
          const rxOrder = rxOrderRes.rows[0];
          const itemsRes = await client.query(`
            SELECT * FROM pharmacy_order_items WHERE order_id::text = $1
          `, [rxOrder.id]);

          const meds = itemsRes.rows.map((it: any, idx: number) => ({
            id: it.id || idx + 1,
            name: it.medicine_name,
            instruction: "1 tablet • Once daily",
            duration: "7 days",
            qty: `${it.quantity || 1} units`
          }));

          const orderDate = rxOrder.created_at ? new Date(rxOrder.created_at) : new Date();
          const timeStr = orderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

          return {
            id: rxOrder.id,
            order_number: rxOrder.order_number || rxOrder.id,
            total_amount: 535,
            medicine_cost: 520,
            delivery_charge: 15,
            status: rxOrder.status || "placed",
            delivery_address: {
              full_address: rxOrder.delivery_address || "12, Lattice Bridge Road, Adyar, Chennai - 600020",
              lat: "13.0067",
              lng: "80.2570"
            },
            status_timeline: [
              { status: "Order Placed", date: orderDate.toISOString(), time: timeStr }
            ],
            medicines: meds,
            payment_status: "paid"
          };
        }

        return null;
      }

      const o = orderRes.rows[0];

      // 2. Fetch order medicines / items
      const itemsRes = await client.query(`
        SELECT 
          oi.id,
          COALESCE(m.medicine_name, oi.dosage_instruction, 'Prescribed Medicine') as name,
          oi.dosage_instruction as instruction,
          oi.days as duration,
          oi.quantity as qty
        FROM order_items oi
        LEFT JOIN medicines m ON oi.medicine_id = m.id
        WHERE oi.order_id::text = $1
        ORDER BY oi.id ASC
      `, [o.id]);

      let medicines = itemsRes.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        instruction: r.instruction || "1 tablet • Once daily",
        duration: r.duration || "7 days",
        qty: r.qty || "1 tablet"
      }));

      if (medicines.length === 0) {
        const rxItemsRes = await client.query(`
          SELECT id, medicine_name as name, quantity as qty
          FROM pharmacy_order_items
          WHERE order_id::text = $1
        `, [o.id]);
        if (rxItemsRes.rows.length > 0) {
          medicines = rxItemsRes.rows.map((it: any, idx: number) => ({
            id: it.id || idx + 1,
            name: it.name,
            instruction: "1 tablet • Once daily",
            duration: "7 days",
            qty: `${it.qty || 1} units`
          }));
        }
      }

      // 3. Fetch status timeline logs
      const statusRes = await client.query(`
        SELECT status, status_date FROM order_status_logs
        WHERE order_id::text = $1
        ORDER BY status_date ASC
      `, [o.id]);

      const status_timeline = statusRes.rows.map((sl: any) => {
        const d = sl.status_date ? new Date(sl.status_date) : new Date();
        const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        return {
          status: sl.status,
          date: d.toISOString(),
          time: timeStr
        };
      });

      return {
        id: o.id,
        order_number: o.order_number || o.id,
        total_amount: parseFloat(o.total_amount) || 535,
        medicine_cost: parseFloat(o.medicine_cost) || 520,
        delivery_charge: parseFloat(o.delivery_charge) || 15,
        status: (o.status || "delivered").toLowerCase(),
        delivery_address: {
          full_address: o.full_address || "12, Lattice Bridge Road, Adyar, Chennai - 600020",
          lat: o.lat || "13.0067",
          lng: o.lng || "80.2570"
        },
        status_timeline: status_timeline.length > 0 ? status_timeline : [
          { status: "Order Placed", date: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(), time: "10:15 AM" }
        ],
        medicines: medicines,
        payment_status: o.payment_status || "paid"
      };
    } finally {
      client.release();
    }
  }

  async updateOrderStatus(orderId: string, newStatus: string, options?: { note?: string }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Update in orders table if present
      const res = await client.query(
        "UPDATE orders SET status = , updated_at = NOW() WHERE id::text =  OR order_number =  RETURNING id, status, order_number",
        [newStatus, orderId]
      );
      
      // Also update in pharmacy_orders table if present
      await client.query(
        "UPDATE pharmacy_orders SET status = , updated_at = NOW() WHERE id::text =  OR order_number = ",
        [newStatus, orderId]
      );

      const resolvedId = res.rows[0]?.id || orderId;

      // Status label for timeline
      const statusTitleMap: Record<string, string> = {
        placed: "Order Placed",
        processing: "Order Processing",
        packed: "Order Packed",
        out_for_delivery: "Out for Delivery",
        shipped: "Order Dispatched",
        delivered: "Order Delivered",
        cancelled: "Order Cancelled",
        refunded: "Order Refunded"
      };
      const label = statusTitleMap[newStatus.toLowerCase()] || newStatus;

      await client.query(
        "INSERT INTO order_status_logs (order_id, status, status_date) VALUES (, , NOW())",
        [resolvedId, label]
      );

      await client.query("COMMIT");

      // Post-commit dispatch notification
      try {
        await orderNotificationService.sendOrderNotification(resolvedId, newStatus);
      } catch (notifErr) {
        logger.error({ err: notifErr, orderId: resolvedId, newStatus }, "Failed to send order status notification");
      }

      return { success: true, orderId: resolvedId, status: newStatus };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

}

export const ordersService = new OrdersService();
