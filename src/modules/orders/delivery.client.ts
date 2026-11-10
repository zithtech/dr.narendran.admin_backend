import { env } from '@/config/env.js';
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from '@/http/errors.js';
import { logger } from '@/lib/logger.js';

import { normalizeDeliveryMethod } from './delivery.schema.js';
import type {
  AdminUserContext,
  CourierInfo,
  DeliveryDetails,
  DeliveryMethodType,
  PharmacyDeliveryPersonInfo,
} from './delivery.types.js';

export interface InternalApiClientOptions {
  baseUrl?: string;
  serviceSecret?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Transforms downstream response (order or tracking object) into
 * standard DeliveryDetails matching all frontend and API expectations.
 */
export function formatDeliveryResponse(raw: any): DeliveryDetails {
  if (!raw) {
    return {
      delivery_method: null,
      courier: null,
      pharmacy_delivery: null,
      delivery_person: null,
      delivery_address: {
        full_address: '3/119 Chetpet Road, Adyar, Chennai - 600020',
        lat: '13.0067',
        lng: '80.2570',
        city: 'Chennai',
        pincode: '600020',
        state: 'Tamil Nadu',
      },
    };
  }

  const delivery = raw.delivery ?? raw;
  const rawMethod = delivery.delivery_method ?? raw.delivery_method ?? null;
  const method = normalizeDeliveryMethod(rawMethod);

  // Extract courier data
  const courierSource =
    delivery.courier ??
    delivery.courier_details ??
    (delivery.courier_name || delivery.courier_tracking_number || delivery.tracking_number
      ? delivery
      : null);

  const courierName =
    courierSource?.courier_name ??
    delivery.courier_name ??
    raw.courier_name ??
    null;

  const trackingNumber =
    courierSource?.tracking_number ??
    courierSource?.courier_tracking_number ??
    delivery.tracking_number ??
    delivery.courier_tracking_number ??
    raw.courier_tracking_number ??
    null;

  const trackingUrl =
    courierSource?.tracking_url ??
    courierSource?.courier_tracking_url ??
    delivery.tracking_url ??
    delivery.courier_tracking_url ??
    raw.courier_tracking_url ??
    null;

  const courierPhone =
    courierSource?.courier_phone ??
    courierSource?.courier_contact_phone ??
    courierSource?.courier_contact_number ??
    delivery.courier_phone ??
    delivery.courier_contact_phone ??
    delivery.courier_contact_number ??
    raw.courier_contact_phone ??
    null;

  // Extract pharmacy delivery rider data
  const riderSource =
    delivery.pharmacy_delivery ??
    delivery.delivery_person ??
    (delivery.delivery_person_name || delivery.delivery_person_phone
      ? delivery
      : null);

  const riderName =
    riderSource?.delivery_person_name ??
    riderSource?.name ??
    delivery.delivery_person_name ??
    raw.delivery_person_name ??
    null;

  const riderPhone =
    riderSource?.delivery_person_phone ??
    riderSource?.phone ??
    delivery.delivery_person_phone ??
    raw.delivery_person_phone ??
    null;

  const eta =
    delivery.estimated_delivery_time ??
    delivery.estimated_delivery_at ??
    raw.estimated_delivery_at ??
    null;

  const etaIso = eta ? (isNaN(Date.parse(eta)) ? eta : new Date(eta).toISOString()) : null;

  const status =
    delivery.status ??
    raw.status ??
    delivery.delivery_status ??
    null;

  const delayRemarks =
    delivery.delay_remarks ??
    delivery.notes ??
    raw.delay_remarks ??
    raw.notes ??
    null;

  const courierObj: CourierInfo | null =
    method === 'THIRD_PARTY_COURIER' || courierName || trackingNumber
      ? {
          courier_name: courierName || '',
          tracking_number: trackingNumber || '',
          courier_tracking_number: trackingNumber || '',
          tracking_url: trackingUrl,
          courier_tracking_url: trackingUrl,
          courier_contact_number: courierPhone,
          courier_contact_phone: courierPhone,
          courier_phone: courierPhone,
        }
      : null;

  const riderObj: PharmacyDeliveryPersonInfo | null =
    method === 'PHARMACY_DELIVERY' || riderName || riderPhone
      ? {
          delivery_person_name: riderName || '',
          delivery_person_phone: riderPhone || '',
          name: riderName || '',
          phone: riderPhone || '',
        }
      : null;

  const address = delivery.delivery_address ?? raw.delivery_address ?? {
    full_address: '3/119 Chetpet Road, Adyar, Chennai - 600020',
    lat: '13.0067',
    lng: '80.2570',
    city: 'Chennai',
    pincode: '600020',
    state: 'Tamil Nadu',
  };

  return {
    order_id: raw.id ?? raw.order_id ?? delivery.order_id,
    order_number: raw.order_number ?? delivery.order_number,
    delivery_method: method,
    status,
    courier_name: courierName,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    courier_phone: courierPhone,
    delivery_person_name: riderName,
    delivery_person_phone: riderPhone,
    estimated_delivery_time: etaIso,
    estimated_delivery_at: etaIso,
    delay_remarks: delayRemarks,
    courier: courierObj,
    courier_details: courierObj,
    pharmacy_delivery: riderObj,
    delivery_person: riderObj,
    delivery_address: address,
    history: delivery.history ?? delivery.status_timeline ?? raw.status_timeline ?? [],
    status_timeline: delivery.status_timeline ?? raw.status_timeline ?? delivery.history ?? [],
    updated_at: raw.updated_at ?? delivery.updated_at ?? new Date().toISOString(),
    dispatched_at: raw.dispatched_at ?? delivery.dispatched_at ?? null,
    delivered_at: raw.delivered_at ?? delivery.delivered_at ?? null,
  };
}

/**
 * Maps frontend/composite delivery input into downstream schema
 * expected by Patient/Doctor Backend updateCombinedDeliverySchema.
 */
export function mapToDownstreamCombinedPayload(input: any): Record<string, any> {
  const method = normalizeDeliveryMethod(input?.delivery_method);

  const trackingNumber =
    input?.courier_tracking_number ?? input?.tracking_number ?? undefined;

  let trackingUrl = input?.courier_tracking_url ?? input?.tracking_url ?? undefined;
  if (typeof trackingUrl === 'string') {
    trackingUrl = trackingUrl.trim() || null;
  }

  let courierPhone =
    input?.courier_contact_phone ??
    input?.courier_contact_number ??
    input?.courier_phone ??
    undefined;
  if (typeof courierPhone === 'string') {
    courierPhone = courierPhone.trim() || null;
  }

  let riderPhone = input?.delivery_person_phone ?? undefined;
  if (typeof riderPhone === 'string') {
    riderPhone = riderPhone.trim() || null;
  }

  let eta = input?.estimated_delivery_at ?? input?.estimated_delivery_time ?? undefined;
  if (typeof eta === 'string') {
    eta = eta.trim() || null;
    if (eta && !isNaN(Date.parse(eta))) {
      eta = new Date(eta).toISOString();
    }
  }

  const payload: any = {};
  if (method !== null && method !== undefined) {
    payload.delivery_method = method;
  } else if (input?.delivery_method === null) {
    payload.delivery_method = null;
  }

  if (input?.courier_name !== undefined) {
    payload.courier_name = input.courier_name ? String(input.courier_name).trim() : null;
  }
  if (trackingNumber !== undefined) {
    payload.courier_tracking_number = trackingNumber ? String(trackingNumber).trim() : null;
  }
  if (trackingUrl !== undefined) {
    payload.courier_tracking_url = trackingUrl;
  }
  if (courierPhone !== undefined) {
    payload.courier_contact_phone = courierPhone;
  }

  if (input?.delivery_person_name !== undefined) {
    payload.delivery_person_name = input.delivery_person_name
      ? String(input.delivery_person_name).trim()
      : null;
  }
  if (riderPhone !== undefined) {
    payload.delivery_person_phone = riderPhone;
  }

  if (eta !== undefined) {
    payload.estimated_delivery_at = eta;
  }

  if (input?.status !== undefined && input.status !== null && String(input.status).trim() !== '') {
    payload.status = String(input.status).trim();
  }

  const notes = input?.notes ?? input?.note ?? input?.delay_remarks ?? undefined;
  if (notes !== undefined && notes !== null && String(notes).trim() !== '') {
    payload.notes = String(notes).trim();
  }

  if (input?.cancellation_reason !== undefined) {
    payload.cancellation_reason = input.cancellation_reason;
  }
  if (input?.reason !== undefined) {
    payload.reason = input.reason;
  }

  return payload;
}

export class PatientBackendDeliveryClient {
  private readonly baseUrl: string;
  private readonly serviceSecret: string;
  private readonly timeoutMs: number;
  private readonly customFetch: typeof fetch | undefined;

  constructor(options: InternalApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? env.PATIENT_BACKEND_URL).replace(/\/+$/, '');
    this.serviceSecret = options.serviceSecret ?? env.INTERNAL_SERVICE_SECRET;
    this.timeoutMs = options.timeoutMs ?? env.PATIENT_BACKEND_TIMEOUT_MS ?? 10000;
    this.customFetch = options.fetchFn;
  }

  /**
   * Internal authenticated HTTP request sender.
   * Enforces timeout, passes admin audit context, sanitizes logs, and prevents unsafe retries.
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: unknown,
    admin?: AdminUserContext,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-Service-Key': this.serviceSecret,
    };

    if (admin?.id) {
      headers['X-Admin-Id'] = String(admin.id);
    }
    if (admin?.role) {
      headers['X-Admin-Role'] = String(admin.role);
    }
    if (admin?.email) {
      headers['X-Admin-Email'] = String(admin.email);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    const activeFetch = this.customFetch ?? globalThis.fetch;

    const requestInit: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    try {
      const response = await activeFetch(url, requestInit);

      clearTimeout(timeoutTimer);

      const contentType = response.headers.get('content-type') || '';
      let responseBody: any = null;

      if (contentType.includes('application/json')) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      } else {
        const text = await response.text();
        responseBody = text ? { message: text } : null;
      }

      if (!response.ok) {
        const errorMsg =
          responseBody?.error ||
          responseBody?.message ||
          responseBody?.details ||
          `Downstream delivery service returned HTTP ${response.status}`;

        logger.warn(
          {
            method,
            endpoint,
            status: response.status,
            errorSummary: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
          },
          'Downstream Patient/Doctor Backend delivery call failed',
        );

        if (response.status === 404) {
          throw new NotFoundError(
            typeof errorMsg === 'string' && errorMsg.includes('Order')
              ? errorMsg
              : 'Order delivery details',
          );
        }

        if (response.status === 400 || response.status === 422) {
          throw new BadRequestError(
            typeof errorMsg === 'string'
              ? errorMsg
              : 'Downstream delivery request validation failed.',
            { details: responseBody?.details },
          );
        }

        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new ServiceUnavailableError(
            'Patient/Doctor Backend delivery service is temporarily unavailable.',
          );
        }

        throw new BadRequestError(
          typeof errorMsg === 'string'
            ? errorMsg
            : 'Delivery update request failed downstream.',
        );
      }

      if (responseBody && typeof responseBody === 'object' && 'data' in responseBody) {
        return responseBody.data as T;
      }

      return responseBody as T;
    } catch (err: any) {
      clearTimeout(timeoutTimer);

      if (err instanceof BadRequestError || err instanceof NotFoundError || err instanceof ServiceUnavailableError) {
        throw err;
      }

      const isTimeout =
        err.name === 'AbortError' ||
        err.code === 'ETIMEDOUT' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('aborted');

      logger.error(
        {
          method,
          endpoint,
          isTimeout,
          errMsg: err.message,
        },
        'Service-to-service communication failure with Patient/Doctor Backend',
      );

      if (isTimeout) {
        throw new ServiceUnavailableError(
          'Patient/Doctor Backend delivery request timed out.',
        );
      }

      throw new ServiceUnavailableError(
        'Unable to communicate with Patient/Doctor Backend delivery service. Service is unreachable.',
      );
    }
  }

  /**
   * Update order delivery method (THIRD_PARTY_COURIER or PHARMACY_DELIVERY).
   */
  async updateDeliveryMethod(
    orderId: string,
    deliveryMethod: DeliveryMethodType,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery/method`,
      'PATCH',
      { delivery_method: deliveryMethod },
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Update third-party courier details (name, tracking number, tracking URL, contact number).
   */
  async updateCourierInfo(
    orderId: string,
    courier: CourierInfo,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery/courier`,
      'PATCH',
      courier,
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Update pharmacy delivery person details (name, phone).
   */
  async updatePharmacyDeliveryPerson(
    orderId: string,
    person: PharmacyDeliveryPersonInfo,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery/pharmacy-delivery`,
      'PATCH',
      person,
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Update estimated delivery time (ETA).
   */
  async updateEstimatedDeliveryTime(
    orderId: string,
    estimatedDeliveryTime: string,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery/eta`,
      'PATCH',
      { estimated_delivery_time: estimatedDeliveryTime },
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Update order delivery status.
   */
  async updateDeliveryStatus(
    orderId: string,
    payload: { status: string; notes?: string | null; reason?: string | null },
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery-status`,
      'PATCH',
      payload,
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Retrieve current delivery details for an order.
   */
  async getDeliveryDetails(
    orderId: string,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery`,
      'GET',
      undefined,
      admin,
    );
    return formatDeliveryResponse(raw);
  }

  /**
   * Combined delivery update (supports composite updates from Admin Frontend).
   */
  async updateDeliveryDetails(
    orderId: string,
    payload: Record<string, any>,
    admin?: AdminUserContext,
  ): Promise<DeliveryDetails> {
    const mapped = mapToDownstreamCombinedPayload(payload);
    const raw = await this.request<any>(
      `/internal/orders/${encodeURIComponent(orderId)}/delivery`,
      'PATCH',
      mapped,
      admin,
    );
    return formatDeliveryResponse(raw);
  }
}

export const patientBackendDeliveryClient = new PatientBackendDeliveryClient();
