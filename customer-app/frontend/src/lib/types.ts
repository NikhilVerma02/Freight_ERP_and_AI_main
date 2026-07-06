export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: "customer" | "admin";
  created_at?: string;
}

export interface Order {
  id: string;
  order_number?: string;
  customer_username: string;
  vendor_username: string;
  status: string;
  items?: string;
  quantity?: number | null;
  notes?: string;
  total_amount?: number;
  required_by?: string | null;
  requested_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Claim {
  id: string;
  claim_number?: string;
  order_id?: string;
  order_number?: string;
  customer_username: string;
  customer_company_name?: string | null;
  vendor_username: string;
  vendor_company_name?: string | null;
  sku?: string;
  damage_type?: string;
  damaged_qty?: number;
  claim_text?: string;
  status: string;
  description?: string;
  decision?: string;
  decision_reason?: string | null;
  amount?: number;
  created_at?: string;
  updated_at?: string;
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

export interface CustomerInventoryItem {
  id: string;
  customer_username: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  quantity: number;
  unit_price?: number;
  updated_at?: string;
}

export interface SlaDoc {
  id: string;
  vendor_username: string;
  vendor_company_name?: string;
  filename: string;
  upload_date?: string;
}
