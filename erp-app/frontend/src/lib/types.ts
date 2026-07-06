export type ErpRole = "admin" | "procurement_officer" | "inventory_controller" | "finance_officer";
export type VendorRole = "vendor_order_manager" | "vendor_claim_handler";
export type CustomerRole = "customer";
export type Role = ErpRole | VendorRole | CustomerRole;

export interface OrderItem {
  sku: string;
  item_name: string;
  qty: number;
}

export type OrderStatus = "requested" | "delivered" | "undelivered";

export interface Order {
  id: number;
  order_number: string;
  customer_username: string;
  vendor_username: string | null;
  items: OrderItem[];
  status: OrderStatus;
  undelivered_reason?: string | null;
  quantity?: number | null;
  notes?: string | null;
  total_amount?: number | null;
  required_by?: string | null;
  requested_at?: string;
  created_at?: string;
  updated_at?: string;
}

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface Claim {
  id: number;
  claim_number: string;
  customer_username: string;
  customer_company_name?: string | null;
  vendor_username: string;
  vendor_company_name?: string | null;
  order_id: number;
  order_number?: string | null;
  sku: string;
  damage_type: string;
  damaged_qty: number;
  claim_text: string;
  status: ClaimStatus;
  decision_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VendorInventoryItem {
  id: number;
  vendor_username: string;
  sku: string;
  item_name: string;
  qty_on_hand: number;
  reorder_threshold: number;
  manufacturing_critical: boolean;
  damaged_qty?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerInventoryItem {
  id: number;
  customer_username: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  qty_on_hand: number;
  created_at?: string;
  updated_at?: string;
}

export interface VendorSla {
  id: number;
  vendor_username: string;
  customer_usernames: string[];
  sla_document_filename: string;
  sla_text_cache: string;
  liability_summary: string;
  uploaded_at?: string;
}

export interface SlaAskResponse {
  answer: string | null;
  sources: string[];
  error: string | null;
}

export type AlertAudience = "admin" | "vendor" | "customer";
export type AlertStatus = "unread" | "read";

export interface Alert {
  id: number;
  audience: AlertAudience;
  target_username?: string | null;
  type: string;
  title: string;
  message: string;
  related_id?: number | null;
  status: AlertStatus;
  created_at?: string;
}

export interface CustomerVendorLink {
  id: number;
  customer_username: string;
  vendor_username: string;
  linked_at?: string;
}

export interface User {
  username: string;
  role: Role;
  display_name: string;
  company_name?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MyCustomer {
  username: string;
  display_name: string;
  company_name?: string | null;
  order_count: number;
  claim_count: number;
}

export interface MyVendor {
  username: string;
  display_name: string;
  company_name?: string | null;
  order_count: number;
  claim_count: number;
}

export interface RagEvalAverages {
  faithfulness?: number;
  answer_relevancy?: number;
  context_precision?: number;
  context_recall?: number;
}

export interface RagEvalSummary {
  run_id: string;
  averages: RagEvalAverages;
  question_count: number;
}

export interface RagEvalRow extends RagEvalAverages {
  user_input: string;
}

export interface RagEvalDetail {
  run_id: string;
  averages: RagEvalAverages;
  rows: RagEvalRow[];
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  quantity: number;
  status: string;
  delivery_date: string | null;
  created_by: string;
  date_raised: string;
  inventory_added?: boolean | null;
  so_number?: string | null;
  cost_per_unit?: number | null;
  total_cost?: number | null;
  accepted_qty?: number | null;
  damaged_qty?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  po_id: string;
  vendor_username: string;
  dispatched_at: string;
  delivered_at?: string | null;
  status: string;
  notes?: string | null;
  created_at?: string;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  module: string;
  record_id?: number | null;
  details?: string;
  timestamp: string;
}
