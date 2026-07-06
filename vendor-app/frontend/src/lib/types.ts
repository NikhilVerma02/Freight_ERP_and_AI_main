export type VendorRole = "vendor_order_manager" | "vendor_claim_handler" | "admin";

export interface User {
  id: string;
  username: string;
  display_name: string;
  company_name?: string;
  email: string;
  role: VendorRole;
  created_at?: string;
}

export interface Order {
  id: string;
  order_number?: string;
  customer_username: string;
  vendor_username: string;
  status: string;
  items?: string;
  total_amount?: number;
  notes?: string;
  requested_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Claim {
  id: number;
  claim_number?: string;
  order_id?: number;
  order_number?: string;
  customer_username: string;
  customer_display_name?: string;
  customer_company_name?: string;
  vendor_username: string;
  vendor_display_name?: string;
  vendor_company_name?: string;
  sku?: string;
  damage_type?: string;
  damaged_qty?: number;
  claim_text?: string;
  status: string;
  decision_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  so_number?: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  quantity: number;
  status: string;
  delivery_date?: string;
  date_raised?: string;
  cost_per_unit?: number | null;
  total_cost?: number | null;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  po_id: string;
  po_number: string;
  vendor_username: string;
  status: string;
  dispatched_at?: string;
  delivered_at?: string;
  notes?: string;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  target_role?: string;
  target_username?: string;
  status: "unread" | "read";
  created_at?: string;
}

export interface SlaDoc {
  id: string;
  vendor_username: string;
  filename: string;
  upload_date?: string;
  customer_usernames?: string[];
}
