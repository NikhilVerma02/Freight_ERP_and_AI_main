import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { PurchaseOrder } from "../lib/types";
import { APP_NAME } from "../lib/constants";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  Pending: "yellow",
  Acknowledged: "blue",
  Dispatched: "blue",
  Delivered: "green",
  Cancelled: "red",
};

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function customerCompany(po: PurchaseOrder) {
  if ((po as any).created_by === "ai-agent") return APP_NAME;
  return (po as any).created_by_company || (po as any).customer_name || "—";
}

function raisedBy(po: PurchaseOrder) {
  if ((po as any).created_by === "ai-agent") return APP_NAME;
  return (po as any).created_by_display_name || (po as any).created_by || "—";
}

export default function PurchaseOrders() {
  const { show } = useToast();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [costPerUnit, setCostPerUnit] = useState("");

  async function load() {
    try {
      const data = await api.get<PurchaseOrder[]>("/api/purchase-orders");
      setPos(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load POs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openModal(po: PurchaseOrder) {
    setSelected(po);
    setCostPerUnit(po.cost_per_unit != null ? String(po.cost_per_unit) : "");
  }

  async function markDelivered() {
    if (!selected) return;
    setDelivering(true);
    try {
      const cpu = parseFloat(costPerUnit);
      await api.put(`/api/purchase-orders/${selected.id}/deliver`, {
        cost_per_unit: !isNaN(cpu) && cpu > 0 ? cpu : null,
      });
      show("success", "PO marked as Delivered — inventory updated");
      setSelected(null);
      await load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to mark delivered");
    } finally {
      setDelivering(false);
    }
  }

  const pending = pos.filter((p) => p.status === "Pending").length;
  const delivered = pos.filter((p) => p.status === "Delivered").length;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            POs raised by ERP procurement. Confirm delivery to update your inventory.
          </p>
        </div>
        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-center min-w-[72px]">
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{pending}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600/70 dark:text-amber-400/70">Pending</p>
          </div>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-center min-w-[72px]">
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{delivered}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70">Delivered</p>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["PO Number", "SKU", "Item", "Qty", "Status", "Customer", "Raised By", "Delivery Date", "Raised", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                        <path className="opacity-75" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                      Loading purchase orders…
                    </div>
                  </td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                    No purchase orders yet.
                  </td>
                </tr>
              ) : (
                pos.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => openModal(po)}
                    className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {po.po_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{po.sku}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{po.item_name}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">{po.quantity}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_BADGE[po.status] ?? "slate"}>{po.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{customerCompany(po)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{raisedBy(po)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmt(po.delivery_date)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-500 whitespace-nowrap text-xs">{fmt(po.date_raised)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity underline underline-offset-2">
                        Open →
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Detail Modal ── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`PO — ${selected?.po_number}`} width="max-w-md">
        {selected && (
          <div className="flex flex-col gap-4">

            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">PO Number</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-800 dark:text-slate-200">{selected.po_number}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Status</p>
                <p className="mt-0.5"><Badge tone={STATUS_BADGE[selected.status] ?? "slate"}>{selected.status}</Badge></p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">SKU</p>
                <p className="mt-0.5 font-mono text-slate-700 dark:text-slate-300">{selected.sku}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Item</p>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">{selected.item_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Quantity</p>
                <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{selected.quantity}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Customer</p>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">{customerCompany(selected)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Raised By</p>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">{raisedBy(selected)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Delivery Date</p>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">{fmt(selected.delivery_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Raised On</p>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">{fmt(selected.date_raised)}</p>
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {selected.status !== "Delivered" ? (
              <>
                <Input
                  label="Cost per Unit (optional)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 12.50"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                />
                {(() => {
                  const cpu = parseFloat(costPerUnit);
                  const total = !isNaN(cpu) && cpu > 0 ? cpu * selected.quantity : null;
                  return total !== null ? (
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Total Cost:{" "}
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">({selected.quantity} × ₹{cpu})</span>
                    </p>
                  ) : null;
                })()}
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  Confirming delivery will add{" "}
                  <strong>{selected.quantity} × {selected.item_name}</strong> to your inventory.
                </div>
              </>
            ) : (
              selected.total_cost != null && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                  <span className="font-medium">Total Cost:</span>{" "}
                  ₹{Number(selected.total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  {selected.cost_per_unit != null && (
                    <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">@ ₹{selected.cost_per_unit}/unit</span>
                  )}
                </div>
              )
            )}

            <div className="flex flex-wrap gap-2">
              {selected.status !== "Delivered" && (
                <Button onClick={markDelivered} disabled={delivering}>
                  {delivering ? "Updating…" : "✓ Mark as Delivered"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
