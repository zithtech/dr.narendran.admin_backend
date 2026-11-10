import type { UserRole } from "@/modules/users/users.types.js";

export interface ActingUserContext {
  id: string;
  email?: string;
  role?: UserRole;
}

export interface PatientOrderSummary {
  id: string | null;
  name: string;
  phone: string;
  email: string;
}

export interface OrderListItem {
  id: string;
  order_number: string;
  total_amount: number;
  medicine_cost: number;
  delivery_charge: number;
  status: string;
  payment_status: string;
  item_count: number;
  medicines_preview: string;
  delivery_address: string;
  created_at: string;
  updated_at: string;
  patient: PatientOrderSummary | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface OrderStatusCounts {
  placed: number;
  processing: number;
  packed: number;
  out_for_delivery: number;
  delivered: number;
  cancelled: number;
}

export interface PaymentStatusCounts {
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
}

export interface DashboardSummaryMetrics {
  totalOrders: number;
  totalRevenue: number;
  todayOrders: number;
  todayRevenue: number;
  statusCounts: OrderStatusCounts;
  paymentCounts: PaymentStatusCounts;
}

export interface OrderItemDetail {
  id: string | number;
  medicine_id: string | null;
  name: string;
  strength: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  dosage_instruction: string;
  duration: string;
}

export interface OrderTimelineLog {
  id: number;
  status: string;
  raw_status: string;
  date: string;
  time: string;
  notes: string | null;
  admin_id: string | null;
  admin_name: string | null;
}

export interface OrderPaymentDetail {
  id: string;
  cf_order_id: string | null;
  cf_payment_id: string | null;
  payment_session_id: string | null;
  payment_method: string | null;
  bank_reference: string | null;
  payment_time: string | null;
  amount: number;
  currency: string;
  status: string;
  refund_id: string | null;
  refund_amount: number | null;
  refund_status: string | null;
  failure_reason: string | null;
}

export interface OrderDetails {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  pricing: {
    subtotal: number;
    medicine_cost: number;
    discounts: number;
    delivery_charge: number;
    total_amount: number;
  };
  patient: {
    id: string | null;
    name: string;
    phone: string;
    email: string;
    gender: string | null;
    date_of_birth: string | null;
    blood_group: string | null;
  } | null;
  prescription: {
    id: string;
    prescription_date: string;
    prescription_type: string;
    doctor: {
      id: string | null;
      name: string | null;
      specialization: string | null;
    } | null;
    prescription_url: string | null;
  } | null;
  delivery: {
    delivery_method: string | null;
    courier_name?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    courier_phone?: string | null;
    delivery_person_name?: string | null;
    delivery_person_phone?: string | null;
    estimated_delivery_time?: string | null;
    delay_remarks?: string | null;
    delivery_status?: string | null;
    status?: string | null;
    courier?: {
      courier_name: string;
      tracking_number: string;
      courier_tracking_number?: string | null;
      tracking_url?: string | null;
      courier_tracking_url?: string | null;
      courier_contact_number?: string | null;
      courier_contact_phone?: string | null;
      courier_phone?: string | null;
    } | null;
    pharmacy_delivery?: {
      delivery_person_name: string;
      delivery_person_phone: string;
      name?: string | null;
      phone?: string | null;
    } | null;
    delivery_person?: {
      delivery_person_name: string;
      delivery_person_phone: string;
      name?: string | null;
      phone?: string | null;
    } | null;
    delivery_address: {
      full_address: string;
      lat: string | null;
      lng: string | null;
      city: string | null;
      pincode: string | null;
      state: string | null;
    };
  };
  medicines: OrderItemDetail[];
  payment: OrderPaymentDetail | null;
  status_timeline: OrderTimelineLog[];
}
