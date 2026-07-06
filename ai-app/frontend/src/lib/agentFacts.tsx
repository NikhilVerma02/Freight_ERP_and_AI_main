import React from "react";
import type { TFunction } from "i18next";
import { Badge } from "../components/ui";

export const STEP_KEYS = ["inspector", "context", "policy", "inventory", "reorder", "claim", "governance"] as const;
export type StepKey = typeof STEP_KEYS[number];

export interface Fact {
  label: string;
  value: React.ReactNode;
}

interface AgentMeta {
  icon: string;
  titleKey: string;
  subtitleKey: string;
  emptyKey: string;
}

export const AGENT_META: Record<StepKey, AgentMeta> = {
  inspector: { icon: "🔍", titleKey: "detail.inspectorTitle", subtitleKey: "detail.inspectorSubtitle", emptyKey: "detail.notRun" },
  context: { icon: "🧩", titleKey: "detail.contextTitle", subtitleKey: "detail.contextSubtitle", emptyKey: "detail.notRun" },
  policy: { icon: "📜", titleKey: "detail.policyTitle", subtitleKey: "detail.policySubtitle", emptyKey: "detail.notRun" },
  inventory: { icon: "📦", titleKey: "detail.inventoryTitle", subtitleKey: "detail.inventorySubtitle", emptyKey: "detail.notRun" },
  reorder: { icon: "🔁", titleKey: "detail.reorderTitle", subtitleKey: "detail.reorderSubtitle", emptyKey: "detail.reorderSkipped" },
  claim: { icon: "🧾", titleKey: "detail.claimTitle", subtitleKey: "detail.claimSubtitle", emptyKey: "detail.claimSkipped" },
  governance: { icon: "🛡️", titleKey: "detail.governanceTitle", subtitleKey: "detail.governanceSubtitle", emptyKey: "detail.notRun" },
};

function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function yesNoBadge(t: TFunction, value: boolean) {
  return <Badge tone={value ? "ok" : "neutral"}>{value ? t("common.yes") : t("common.no")}</Badge>;
}

function riskBadge(risk: string) {
  const tone = risk === "critical" ? "failed" : risk === "warning" ? "running" : risk === "safe" ? "ok" : "neutral";
  return <Badge tone={tone}>{risk}</Badge>;
}

/** Every agent reports its own confidence (0-100) — see app/agents/confidence.py. Genuine LLM
 * judgment calls (Inspector/Policy) self-report it; deterministic/tool-grounded agents
 * (Inventory) report a fixed 100; agents whose decision just executes an upstream judgment
 * (Reorder/Claim) inherit it; Context derives its own from concrete reconciliation red flags;
 * Governance averages the three genuine judgments into one overall figure. */
function confidenceBadge(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  const tone = value >= 80 ? "ok" : value >= 50 ? "running" : "failed";
  return <Badge tone={tone}>{value}%</Badge>;
}

/** data is the agent's "clean" output payload — InspectorExtracted, CaseObject, PolicyResult,
 * InventoryResult, the order/claim record (or null), or GovernanceSummary. Same shape whether
 * it came live from a just-finished run or from a persisted agent_logs.json entry. */
export function buildFacts(key: StepKey, data: any, t: TFunction): Fact[] {
  if (!data) return [];
  if (data.skipped) {
    return [{ label: t("detail.skippedReason"), value: data.reason ?? t("detail.skippedGeneric") }];
  }
  switch (key) {
    case "inspector":
      return [
        { label: t("detail.damageType"), value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"), value: data.damaged_qty ?? "—" },
        ...(data.po_number ? [{ label: t("detail.poNumber"), value: data.po_number }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "context":
      return [
        { label: t("detail.damageType"), value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"), value: `${data.damaged_qty ?? "—"} / ${data.ordered_qty ?? "—"}` },
        { label: t("detail.caseSummary"), value: truncate(data.case_summary) },
        ...(data.po_number_mismatch
          ? [{ label: t("detail.needsReview"), value: <Badge tone="failed">{t("common.yes")}</Badge> }]
          : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "policy": {
      const pct = data.claim_percentage ?? null;
      return [
        { label: t("detail.eligibleForClaim"), value: yesNoBadge(t, Boolean(data.eligible_for_claim)) },
        { label: t("detail.liable"), value: String(data.liable ?? "—") },
        { label: t("detail.justification"), value: truncate(data.justification) },
        ...(pct !== null ? [{
          label: "SLA Claim Entitlement",
          value: (
            <Badge tone={pct < 100 ? "running" : "ok"}>
              {pct}% of damaged item value{pct < 100 ? " (SLA cap)" : ""}
            </Badge>
          ),
        }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    }
    case "inventory":
      return [
        { label: t("detail.risk"), value: riskBadge(String(data.risk ?? "unknown")) },
        ...(data.already_added
          ? [{ label: t("detail.inventoryNotice"), value: <span className="text-yellow-400 font-medium">{data.notice || `SKU ${data.sku} with this PO is already added in inventory`}</span> }]
          : [
              { label: t("detail.orderedQty"), value: data.ordered_qty ?? "—" },
              { label: t("detail.damagedQty"), value: data.damaged_qty ?? "—" },
              { label: t("detail.undamagedQty"), value: data.undamaged_qty ?? "—" },
              { label: t("detail.inventoryBooked"), value: data.inventory_booked
                  ? <Badge tone="ok">{t("detail.bookedToERP")}</Badge>
                  : <Badge tone="neutral">{t("common.no")}</Badge> },
            ]),
        ...(data.vendor_below_threshold
          ? [{ label: t("detail.vendorBelowThreshold"), value: <Badge tone="running">{t("common.yes")}</Badge> }]
          : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "reorder":
      return [
        { label: t("detail.reorderOrderNumber"), value: data.order_number ?? "—" },
        ...(data.already_filed
          ? [{ label: t("detail.reorderNotice"), value: <span className="text-yellow-400 font-medium">{data.notice}</span> }]
          : []),
        ...(typeof data.reorder_note === "string" ? [{ label: t("detail.narrative"), value: truncate(data.reorder_note) }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "claim":
      return [
        { label: t("detail.erpClaimId"), value: data.claim_number ?? data.id ?? "—" },
        ...(data.already_filed
          ? [{ label: t("detail.claimNotice"), value: <span className="text-yellow-400 font-medium">{data.notice}</span> }]
          : []),
        { label: t("detail.claimStatus"), value: <Badge tone={data.status === "pending" ? "running" : data.status === "approved" ? "ok" : data.status === "rejected" ? "failed" : "neutral"}>{data.status ?? "—"}</Badge> },
        { label: t("detail.claimVendor"), value: data.vendor_company_name || data.vendor_username || "—" },
        { label: t("detail.claimCustomer"), value: data.customer_company_name || data.customer_username || "Freight ERP" },
        { label: t("detail.claimOrderId"), value: data.order_number ?? data.order_id ?? "—" },
        { label: t("detail.claimSku"), value: data.sku ?? "—" },
        { label: t("detail.damageType"), value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"), value: data.damaged_qty ?? "—" },
        ...(typeof data.claim_text === "string" ? [{ label: t("detail.narrative"), value: <span className="whitespace-pre-wrap">{data.claim_text}</span> }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "governance":
      return [
        { label: t("detail.governanceNarrative"), value: truncate(data.narrative, 220) },
        { label: t("detail.claimFiled"), value: yesNoBadge(t, Boolean(data.claim_filed)) },
        { label: t("detail.reorderPlaced"), value: yesNoBadge(t, Boolean(data.reorder_placed)) },
        { label: t("detail.risk"), value: riskBadge(String(data.inventory_risk ?? "unknown")) },
        { label: t("detail.overallConfidence"), value: confidenceBadge(data.overall_confidence) },
      ];
    default:
      return [];
  }
}
