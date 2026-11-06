import type { NextFunction, Request, Response } from 'express';

import { BadRequestError } from '@/http/errors.js';

import { deliveryService } from './delivery.service.js';

export const DeliveryController = {
  /**
   * PATCH/PUT /api/orders/:id/delivery/method
   * Select delivery method: THIRD_PARTY_COURIER or PHARMACY_DELIVERY.
   */
  async updateMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};
      const { delivery_method } = body;

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }
      if (!delivery_method) {
        throw new BadRequestError("Delivery method is required ('THIRD_PARTY_COURIER' or 'PHARMACY_DELIVERY').");
      }

      const result = await deliveryService.updateDeliveryMethod(
        orderId,
        delivery_method,
        req.user,
      );

      res.json({
        status: 'success',
        data: result,
        message: 'Delivery method updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH/PUT /api/orders/:id/delivery/courier
   * Enter or update third-party courier details.
   */
  async updateCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }
      if (!body.courier_name || !body.tracking_number) {
        throw new BadRequestError('Courier name and tracking number are required.');
      }

      const result = await deliveryService.updateCourierInfo(
        orderId,
        {
          courier_name: body.courier_name,
          tracking_number: body.tracking_number,
          tracking_url: body.tracking_url ?? null,
          courier_contact_number: body.courier_contact_number ?? null,
        },
        req.user,
      );

      res.json({
        status: 'success',
        data: result,
        message: 'Courier information updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH/PUT /api/orders/:id/delivery/pharmacy-delivery (and alias /pharmacy-person)
   * Enter or update pharmacy delivery person details.
   */
  async updatePharmacyDeliveryPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }
      if (!body.delivery_person_name || !body.delivery_person_phone) {
        throw new BadRequestError("Delivery person name and phone number are required.");
      }

      const result = await deliveryService.updatePharmacyDeliveryPerson(
        orderId,
        {
          delivery_person_name: body.delivery_person_name,
          delivery_person_phone: body.delivery_person_phone,
        },
        req.user,
      );

      res.json({
        status: 'success',
        data: result,
        message: 'Pharmacy delivery person details updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH/PUT /api/orders/:id/delivery/eta
   * Update estimated delivery time.
   */
  async updateEta(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }
      if (!body.estimated_delivery_time) {
        throw new BadRequestError('Estimated delivery time (ETA) is required.');
      }

      const result = await deliveryService.updateEstimatedDeliveryTime(
        orderId,
        body.estimated_delivery_time,
        req.user,
      );

      res.json({
        status: 'success',
        data: result,
        message: 'Estimated delivery time updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH/PUT /api/orders/:id/delivery/status
   * Update order delivery status.
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }
      if (!body.status) {
        throw new BadRequestError('Delivery status is required.');
      }

      const result = await deliveryService.updateDeliveryStatus(
        orderId,
        {
          status: body.status,
          notes: body.notes ?? null,
          reason: body.reason ?? null,
        },
        req.user,
      );

      res.json({
        status: 'success',
        data: result,
        message: 'Delivery status updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/orders/:id/delivery
   * Retrieve delivery information for order details.
   */
  async getDeliveryDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }

      const result = await deliveryService.getDeliveryDetails(orderId, req.user);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH/PUT /api/orders/:id/delivery
   * Composite delivery updates.
   */
  async updateComposite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = String((req.validated?.params as any)?.id || req.params['id'] || '').trim();
      const body = (req.validated?.body as any) || req.body || {};

      if (!orderId) {
        throw new BadRequestError('Valid order ID is required.');
      }

      const result = await deliveryService.updateDeliveryDetails(orderId, body, req.user);

      res.json({
        status: 'success',
        data: result,
        message: 'Delivery details updated successfully',
      });
    } catch (err) {
      next(err);
    }
  },
};

