export const DeliveryMethod = {
  THIRD_PARTY_COURIER: 'THIRD_PARTY_COURIER',
  PHARMACY_DELIVERY: 'PHARMACY_DELIVERY',
} as const;

export type DeliveryMethodType =
  (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

export interface CourierInfo {
  courier_name: string;
  tracking_number: string;
  courier_tracking_number?: string | null;
  tracking_url?: string | null;
  courier_tracking_url?: string | null;
  courier_contact_number?: string | null;
  courier_contact_phone?: string | null;
  courier_phone?: string | null;
  notes?: string | null;
}

export interface PharmacyDeliveryPersonInfo {
  delivery_person_name: string;
  delivery_person_phone: string;
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface DeliveryTimelineEntry {
  id?: number | string;
  status: string;
  raw_status?: string | null;
  timestamp?: string;
  date?: string;
  time?: string;
  notes?: string | null;
  updated_by?: string | null;
  admin_id?: string | null;
  admin_name?: string | null;
}

export interface DeliveryAddressInfo {
  full_address: string;
  lat?: string | null;
  lng?: string | null;
  city?: string | null;
  pincode?: string | null;
  state?: string | null;
}

export interface DeliveryDetails {
  order_id?: string;
  order_number?: string;
  delivery_method: DeliveryMethodType | null;
  status?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  courier_phone?: string | null;
  delivery_person_name?: string | null;
  delivery_person_phone?: string | null;
  estimated_delivery_time?: string | null;
  estimated_delivery_at?: string | null;
  delay_remarks?: string | null;
  courier?: CourierInfo | null;
  courier_details?: CourierInfo | null;
  pharmacy_delivery?: PharmacyDeliveryPersonInfo | null;
  delivery_person?: PharmacyDeliveryPersonInfo | null;
  delivery_address?: DeliveryAddressInfo | null;
  history?: DeliveryTimelineEntry[];
  status_timeline?: DeliveryTimelineEntry[];
  updated_at?: string;
  dispatched_at?: string | null;
  delivered_at?: string | null;
}

export interface AdminUserContext {
  id: string;
  email?: string;
  role?: string;
}

export interface DownstreamDeliveryResponse<T = any> {
  status: string;
  data: T;
  message?: string;
}
