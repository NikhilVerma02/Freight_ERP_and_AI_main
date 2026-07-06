// Shared TS types mirroring the AI backend's response shapes.
// See ai-app/backend/app/routers/*.py and app/agents/*.py for source of truth.

export interface LlmEnvelope {
  status: "ok" | "error" | string;
  content?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Upload-form pickers
// ---------------------------------------------------------------------------

export interface VendorOption {
  username: string;
  display_name: string;
  company_name: string | null;
}

export interface CustomerOption {
  username: string;
  display_name: string;
  company_name: string | null;
}

export interface OrderItem {
  sku: string;
  item_name: string;
  qty: number;
}

export interface OrderOption {
  id: number;
  order_number: string;
  customer_username: string;
  vendor_username: string;
  items: OrderItem[];
  status: string;
}

// ---------------------------------------------------------------------------
// Pipeline step shapes
// ---------------------------------------------------------------------------

export interface InspectorExtracted {
  po_number: string | null;
  damage_type: string;
  damaged_qty: number | null;
  evidence_notes: string;
  confidence_notes: string;
}

export interface InspectorOut {
  extracted: InspectorExtracted | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface CaseObject {
  order_id: number;
  order_number: string;
  customer_username: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  ordered_qty: number;
  damaged_qty: number;
  damage_type: string;
  evidence_notes: string;
  confidence_notes: string;
  stated_po_number: string | null;
  po_number_mismatch: boolean;
  needs_review: boolean;
  qty_was_clamped: boolean;
  case_summary: string;
}

export interface ContextOut {
  case: CaseObject | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface PolicyResult {
  liable: boolean | "partial" | string;
  eligible_for_claim: boolean;
  justification: string;
}

export interface PolicyOut {
  result: PolicyResult | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface InventoryResult {
  risk: "safe" | "warning" | "critical" | string;
  customer_qty_before_damage: number;
  customer_qty_after_damage: number;
  vendor_qty_on_hand: number;
  vendor_reorder_threshold: number;
  vendor_below_threshold: boolean;
}

export interface InventoryOut {
  result: InventoryResult | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface ReorderOrder extends OrderOption {
  reorder_note?: string;
}

export interface ReorderOut {
  order: ReorderOrder | null;
  skipped: boolean;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface ClaimRecord {
  id: number;
  claim_number?: string;
  [key: string]: unknown;
}

export interface ClaimOut {
  claim: ClaimRecord | null;
  skipped: boolean;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface GovernanceSummary {
  case_summary: string;
  narrative: string;
  liable: string | boolean;
  eligible_for_claim: boolean;
  claim_filed: boolean;
  claim_id: number | null;
  reorder_placed: boolean;
  reorder_order_id: number | null;
  inventory_risk: string;
  inventory_alert_id: number | null;
}

export interface GovernanceOut {
  summary: GovernanceSummary | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface PipelineRunResult {
  run_id: string;
  status: "running" | "completed" | "partial" | "failed";
  inspector: InspectorOut | null;
  context: ContextOut | null;
  policy: PolicyOut | null;
  inventory: InventoryOut | null;
  reorder: ReorderOut | null;
  claim: ClaimOut | null;
  governance: GovernanceOut | null;
}

export interface AgentRun {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "partial" | "failed";
  case_summary: string;
  claim_id: number | null;
  alert_id: number | null;
  actor_username?: string | null;
  actor_role?: string | null;
}

export interface AgentLogEntry {
  run_id: string;
  agent: string;
  timestamp: string;
  input_summary: unknown;
  output_summary: unknown;
  status: "ok" | "failed";
  latency_ms: number | null;
  model: string | null;
  tokens: { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
  error: string | null;
}

export interface RunDetail {
  run: AgentRun;
  steps: AgentLogEntry[];
}

// Full ERP records for the "Claim Request" / "Order Request" tabs (GET
// /api/claims, GET /api/orders) — distinct from ClaimRecord/ReorderOrder
// above, which are the trimmed shapes embedded in a pipeline run's output.
export interface ClaimRequestRecord {
  id: number;
  claim_number: string;
  customer_username: string;
  vendor_username: string;
  order_id: number;
  sku: string;
  damage_type: string;
  damaged_qty: number;
  claim_text: string;
  status: "pending" | "approved" | "rejected" | string;
  decision_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderRequestRecord extends OrderOption {
  undelivered_reason?: string | null;
  requested_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface KpiAgentSummary {
  total_calls: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
  avg_latency_ms: number;
  total_token_estimate: number;
}

export interface KpiSummary {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  run_success_rate: number | null;
  per_agent: Record<string, KpiAgentSummary>;
  total_log_entries: number;
}
