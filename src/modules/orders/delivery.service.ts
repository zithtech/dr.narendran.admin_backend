import { pool } from '@/db/pool.js';
import { BadRequestError, NotFoundError } from '@/http/errors.js';
import { logger } from '@/lib/logger.js';

import {
  formatDeliveryResponse,
  type PatientBackendDeliveryClient,
  patientBackendDeliveryClient,
} from './delivery.client.js';
import type {
  AdminUserContext,
  CourierInfo,
  DeliveryDetails,
  DeliveryMethodType,
  PharmacyDeliveryPersonInfo,
} from './delivery.types.js';

export class DeliveryService {
  constructor(
    private readonly client: PatientBackendDeliveryClient = patientBackendDeliveryClient,
  ) { }

  /**
   * Helper to verify order existence in pharmacy_orders and resolve order ID.
   */
  private async verifyOrderExists(
    orderId: string,
  ): Promise<{ id: string; order_number: string }> {
    const cleanId = orderId?.trim();
    if (!cleanId || cleanId === 'undefined' || cleanId === 'null') {
      throw new BadRequestError('Valid order ID is required.');
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT id::text as id, COALESCE(order_number, id::text) as order_number 
         FROM pharmacy_orders 
         WHERE id::text = $1 OR order_number = $1 
         LIMIT 1`,
        [cleanId],
      );

      if (res.rows.length === 0) {
        throw new NotFoundError('Order');
      }

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Assign order delivery method: THIRD_PARTY_COURIER or PHARMACY_DELIVERY.
   */
  async updateDeliveryMethod(
    orderId: string,
    method: DeliveryMethodType,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    logger.info(
      { orderId: order.id, method, adminId: admin?.id },
      'Forwarding delivery method update to Patient/Doctor Backend',
    );

    return this.client.updateDeliveryMethod(order.id, method, admin);
  }

  /**
   * Update third-party courier details.
   */
  async updateCourierInfo(
    orderId: string,
    courier: CourierInfo,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    logger.info(
      { orderId: order.id, courierName: courier.courier_name, adminId: admin?.id },
      'Forwarding courier info update to Patient/Doctor Backend',
    );

    return this.client.updateCourierInfo(order.id, courier, admin);
  }

  /**
   * Update pharmacy delivery person information.
   */
  async updatePharmacyDeliveryPerson(
    orderId: string,
    person: PharmacyDeliveryPersonInfo,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    logger.info(
      { orderId: order.id, personName: person.delivery_person_name, adminId: admin?.id },
      'Forwarding pharmacy delivery person update to Patient/Doctor Backend',
    );

    return this.client.updatePharmacyDeliveryPerson(order.id, person, admin);
  }

  /**
   * Update estimated delivery time (ETA).
   */
  async updateEstimatedDeliveryTime(
    orderId: string,
    estimatedDeliveryTime: string,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    logger.info(
      { orderId: order.id, eta: estimatedDeliveryTime, adminId: admin?.id },
      'Forwarding delivery ETA update to Patient/Doctor Backend',
    );

    return this.client.updateEstimatedDeliveryTime(order.id, estimatedDeliveryTime, admin);
  }

  /**
   * Update delivery status.
   */
  async updateDeliveryStatus(
    orderId: string,
    payload: { status: string; notes?: string | null; reason?: string | null },
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    logger.info(
      { orderId: order.id, status: payload.status, adminId: admin?.id },
      'Forwarding delivery status update to Patient/Doctor Backend',
    );

    const result = await this.client.updateDeliveryStatus(order.id, payload, admin);

    // Audit status update into order_status_logs for local dashboard timeline consistency
    try {
      const dbClient = await pool.connect();
      try {
        const adminId =
          admin?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(admin.id)
            ? admin.id
            : null;
        await dbClient.query(
          `INSERT INTO order_status_logs (order_id, status, status_date, created_at, admin_id, notes) 
           VALUES ($1, $2, NOW(), NOW(), $3, $4)`,
          [order.id, payload.status, adminId, payload.notes || payload.reason || 'Delivery status updated'],
        );
      } finally {
        dbClient.release();
      }
    } catch (auditErr) {
      logger.warn({ err: auditErr, orderId: order.id }, 'Could not append local audit log for delivery status');
    }

    return result;
  }

  /**
   * Retrieve delivery details for order.
   */
  async getDeliveryDetails(
    orderId: string,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    try {
      return await this.client.getDeliveryDetails(order.id, admin);
    } catch (err) {
      logger.warn(
        { err, orderId: order.id },
        'Downstream delivery details call failed; reading local pharmacy order snapshot',
      );
      const dbClient = await pool.connect();
      try {
        const res = await dbClient.query(
          `SELECT 
             id::text as id,
             COALESCE(order_number, id::text) as order_number,
             status,
             delivery_method,
             courier_name,
             courier_tracking_number,
             courier_tracking_url,
             courier_contact_phone,
             delivery_person_name,
             delivery_person_phone,
             estimated_delivery_at,
             dispatched_at,
             delivered_at,
             COALESCE(delivery_address, '3/119 Chetpet Road, Adyar, Chennai - 600020') as full_address
           FROM pharmacy_orders 
           WHERE id::text = $1 
           LIMIT 1`,
          [order.id],
        );
        const row = res.rows[0];
        if (!row) {
          throw err;
        }
        return formatDeliveryResponse(row);
      } finally {
        dbClient.release();
      }
    }
  }

  /**
   * Composite update.
   */
  async updateDeliveryDetails(
    orderId: string,
    payload: Record<string, any>,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const order = await this.verifyOrderExists(orderId);
    return this.client.updateDeliveryDetails(order.id, payload, admin);
  }
}

export const deliveryService = new DeliveryService();