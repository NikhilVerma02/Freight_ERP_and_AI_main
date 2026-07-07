import React from "react";
import type { TFunction } from "i18next";
import { Badge } from "../components/ui";

export const STEP_KEYS = ["inspector", "context", "policy", "inventory", "reorder", "claim", "governance"] as const;
export type StepKey = typeof STEP_KEYS[number];

export interface Fact {
  label: string;
  value: React.ReactNode;
  colSpan?: 1 | 2 | 4;
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

function truncate(text: string | null | undefined, _max = 140): string {
  if (!text) return "—";
  return text;
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
        ...(data.po_number_mismatch
          ? [{ label: t("detail.needsReview"), value: <Badge tone="failed">{t("common.yes")}</Badge> }]
          : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
        { label: t("detail.caseSummary"), colSpan: 4 as const, value: <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{data.case_summary ?? "—"}</div> },
      ];
    case "policy": {
      const pct = data.claim_percentage ?? null;
      return [
        { label: t("detail.eligibleForClaim"), value: yesNoBadge(t, Boolean(data.eligible_for_claim)) },
        { label: t("detail.liable"), value: String(data.liable ?? "—") },
        ...(pct !== null ? [{
          label: "SLA Entitlement",
          value: (
            <div className="flex items-center gap-2">
              <Badge tone={pct < 100 ? "running" : "ok"}>{pct}%</Badge>
              <span className="text-xs ai-text-secondary">{pct < 100 ? "of claim value (capped)" : "full item value"}</span>
            </div>
          ),
        }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
        { label: t("detail.justification"), colSpan: 4 as const, value: <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{data.justification ?? "—"}</div> },
      ];
    }
    case "inventory":
      return [
        { label: t("detail.risk"), value: riskBadge(String(data.risk ?? "unknown")) },
        ...(data.already_added
          ? [
              { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
              {
                label: t("detail.inventoryNotice"),
                colSpan: 4 as const,
                value: (
                  <div className="mt-1 flex items-start gap-3 rounded-lg border border-yellow-300/40 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-700 dark:text-yellow-300 break-words">
                    <span className="mt-0.5 text-base">⚠️</span>
                    <span>{data.notice || `SKU '${data.sku}' with PO '${data.source_order_number}' is already added in inventory. No duplicate booking made.`}</span>
                  </div>
                ),
              },
            ]
          : [
              { label: t("detail.orderedQty"), value: data.ordered_qty ?? "—" },
              { label: t("detail.damagedQty"), value: data.damaged_qty ?? "—" },
              { label: t("detail.undamagedQty"), value: data.undamaged_qty ?? "—" },
              { label: t("detail.inventoryBooked"), value: data.inventory_booked
                  ? <Badge tone="ok">{t("detail.bookedToERP")}</Badge>
                  : <Badge tone="neutral">{t("common.no")}</Badge> },
              ...(data.vendor_below_threshold
                ? [{ label: t("detail.vendorBelowThreshold"), value: <Badge tone="running">{t("common.yes")}</Badge> }]
                : []),
              { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
            ]),
      ];
    case "reorder":
      return [
        { label: t("detail.reorderOrderNumber"), value: data.order_number ?? "—" },
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
        ...(data.already_filed
          ? [{
              label: t("detail.reorderNotice"),
              colSpan: 4 as const,
              value: (
                <div className="mt-1 flex items-start gap-3 rounded-lg border border-yellow-300/40 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-700 dark:text-yellow-300 break-words">
                  <span className="mt-0.5 text-base">⚠️</span>
                  <span>{data.notice}</span>
                </div>
              ),
            }]
          : []),
        ...(typeof data.reorder_note === "string" ? [{ label: t("detail.narrative"), colSpan: 4 as const, value: <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{data.reorder_note}</div> }] : []),
      ];
    case "claim": {
      const claimStatusTone = data.status === "approved" ? "ok" : data.status === "rejected" ? "failed" : "running";
      return [
        { label: t("detail.erpClaimId"),    value: <span className="font-mono font-semibold">{data.claim_number ?? data.id ?? "—"}</span> },
        { label: t("detail.claimStatus"),   value: <Badge tone={claimStatusTone}>{data.status ?? "—"}</Badge> },
        { label: t("detail.claimOrderId"),  value: <span className="font-mono">{data.order_number ?? data.order_id ?? "—"}</span> },
        { label: t("detail.claimSku"),      value: <span className="font-mono">{data.sku ?? "—"}</span> },
        { label: t("detail.damageType"),    value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"),    value: data.damaged_qty ?? "—" },
        { label: t("detail.claimVendor"),   value: data.vendor_company_name || data.vendor_username || "—" },
        { label: t("detail.claimCustomer"), value: data.customer_company_name || data.customer_username || "Freight ERP" },
        ...(data.already_filed
          ? [{
              label: t("detail.claimNotice"),
              colSpan: 4 as const,
              value: (
                <div className="mt-1 flex items-start gap-3 rounded-lg border border-yellow-300/40 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-700 dark:text-yellow-300 break-words">
                  <span className="mt-0.5 text-base">⚠️</span>
                  <span>{data.notice}</span>
                </div>
              ),
            }]
          : []),
        ...(typeof data.claim_text === "string" ? [{
          label: t("detail.narrative"),
          colSpan: 4 as const,
          value: (
            <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">
              {data.claim_text}
            </div>
          ),
        }] : []),
        { label: t("detail.confidence"),    value: confidenceBadge(data.confidence) },
      ];
    }
    case "governance":
      return [
        { label: t("detail.claimFiled"), value: yesNoBadge(t, Boolean(data.claim_filed)) },
        { label: t("detail.reorderPlaced"), value: yesNoBadge(t, Boolean(data.reorder_placed)) },
        { label: t("detail.risk"), value: riskBadge(String(data.inventory_risk ?? "unknown")) },
        { label: t("detail.overallConfidence"), value: confidenceBadge(data.overall_confidence) },
        { label: t("detail.governanceNarrative"), colSpan: 4 as const, value: <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">{data.narrative ?? "—"}</div> },
      ];
    default:
      return [];
  }
}
