import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Input";
import type { Claim } from "../lib/types";
import { APP_NAME } from "../lib/constants";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  pending: "yellow",
  investigating: "blue",
  approved: "green",
  rejected: "red",
};

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function customerLabel(c: Claim) {
  return c.customer_company_name || c.customer_display_name || c.customer_username || APP_NAME;
}

function vendorLabel(c: Claim) {
  return c.vendor_company_name || c.vendor_display_name || c.vendor_username || "—";
}

export default function Claims() {
  const { show } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Claim | null>(null);
  const [decision, setDecision] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get<Claim[]>("/api/claims");
      setClaims(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openClaim(c: Claim) {
    setSelected(c);
    setDecision(c.decision_reason ? c.status : "");
    setDecisionReason(c.decision_reason ?? "");
  }

  async function submitDecision() {
    if (!selected || !decision) return;
    setSaving(true);
    try {
      await api.put(`/api/claims/${selected.id}/decision`, { status: decision, decision_reason: decisionReason || null });
      show("success", "Decision submitted");
      setSelected(null);
      await load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to submit decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Claim Requests</h1>
        <p className="text-sm text-slate-500 mt-1">Claims raised against your shipments. Review and submit decisions.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {["Claim #", "Order", "Customer (Company)", "Vendor (Company)", "SKU", "Damage Type", "Qty", "Claim Value", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : claims.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No claims yet.</td></tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => openClaim(c)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {c.claim_number ?? `#${c.id}`}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {c.order_number ?? (c.order_id != null ? String(c.order_id) : "—")}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{customerLabel(c)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{vendorLabel(c)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.sku ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 capitalize">{c.damage_type ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{c.damaged_qty ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {(c as any).claim_value != null
                        ? `₹${Number((c as any).claim_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_BADGE[c.status] ?? "slate"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-accent underline underline-offset-2">Review →</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Claim Review — ${selected?.claim_number ?? `#${selected?.id}`}`}
        width="max-w-2xl"
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Claim #</p>
                <p className="mt-0.5 font-mono font-semibold">{selected.claim_number ?? `#${selected.id}`}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</p>
                <p className="mt-0.5"><Badge tone={STATUS_BADGE[selected.status] ?? "slate"}>{selected.status}</Badge></p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Order</p>
                <p className="mt-0.5 font-mono text-xs">{selected.order_number ?? (selected.order_id != null ? String(selected.order_id) : "—")}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">SKU</p>
                <p className="mt-0.5 font-mono text-xs">{selected.sku ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Customer</p>
                <p className="mt-0.5 font-medium">{customerLabel(selected)}</p>
                {selected.customer_company_name && (
                  <p className="text-[11px] text-slate-400">@{selected.customer_username}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Claim Against (Vendor)</p>
                <p className="mt-0.5 font-medium">{vendorLabel(selected)}</p>
                {selected.vendor_company_name && (
                  <p className="text-[11px] text-slate-400">@{selected.vendor_username}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Damage Type</p>
                <p className="mt-0.5 capitalize">{selected.damage_type ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Damaged Qty</p>
                <p className="mt-0.5">{selected.damaged_qty ?? "—"}</p>
              </div>
              {(selected as any).created_at && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Raised On</p>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                    {new Date((selected as any).created_at).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </p>
                </div>
              )}
              {(selected as any).cost_per_unit != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cost / Unit</p>
                  <p className="mt-0.5">₹{Number((selected as any).cost_per_unit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
              )}
              {(selected as any).claim_value != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Claim Value</p>
                  <p className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{Number((selected as any).claim_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {(selected as any).claim_percentage != null && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">SLA Entitlement</p>
                  <p className={`mt-0.5 font-semibold ${(selected as any).claim_percentage < 100 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {(selected as any).claim_percentage}% of damaged item value
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {(selected as any).claim_percentage < 100 ? "SLA cap applied" : "Full value — no SLA cap"}
                  </p>
                </div>
              )}
            </div>

            {/* Claim narrative */}
            {selected.claim_text && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Claim Narrative</p>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selected.claim_text}
                </div>
              </div>
            )}

            {/* Prior decision reason if any */}
            {selected.decision_reason && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Previous Decision Notes</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{selected.decision_reason}</p>
              </div>
            )}

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* Decision form */}
            <Select id="claim-decision" label="Your Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">Select…</option>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              <option value="investigating">Needs Investigation</option>
            </Select>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1" htmlFor="decision-reason">
                Decision Notes <span className="text-slate-400 normal-case">(optional)</span>
              </label>
              <textarea
                id="decision-reason"
                rows={3}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="Reason for approval / rejection…"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={submitDecision} disabled={!decision || saving}>
                {saving ? "Submitting…" : "Submit Decision"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
