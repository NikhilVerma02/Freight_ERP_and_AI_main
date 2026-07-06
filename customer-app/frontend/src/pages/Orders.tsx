import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { Order, Claim } from "../lib/types";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  requested: "yellow",
  confirmed: "blue",
  processing: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Orders() {
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimSku, setClaimSku] = useState("");
  const [claimDamageType, setClaimDamageType] = useState("");
  const [claimDamagedQty, setClaimDamagedQty] = useState("1");
  const [claimText, setClaimText] = useState("");
  const [submittingClaim, setSubmittingClaim] = useState(false);

  async function load() {
    try {
      const data = await api.get<Order[]>("/api/orders");
      setOrders(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function raiseClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmittingClaim(true);
    try {
      await api.post("/api/claims", {
        order_id: selected.id,
        sku: claimSku,
        damage_type: claimDamageType,
        damaged_qty: parseInt(claimDamagedQty, 10),
        claim_text: claimText,
      });
      show("success", "Claim raised successfully");
      setSelected(null);
      setShowClaimForm(false);
      setClaimSku(""); setClaimDamageType(""); setClaimDamagedQty("1"); setClaimText("");
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to raise claim");
    } finally {
      setSubmittingClaim(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Orders</h1>
          <p className="text-sm text-slate-500 mt-1">All orders you have placed.</p>
        </div>
        <Link to="/new-order">
          <Button>+ New Order</Button>
        </Link>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Order #", "Items", "Qty", "Amount", "Status", "Placed On", "Required By", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No orders yet.</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSelected(o); setShowClaimForm(false); }}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.order_number ?? o.id}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{o.items ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700 text-center">{o.quantity ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700 text-right">{o.total_amount ? `₹${Number(o.total_amount).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_BADGE[o.status] ?? "slate"}>{o.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(o.requested_at || o.created_at)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(o.required_by)}</td>
                    <td className="px-4 py-3 text-right"><span className="text-xs text-accent underline underline-offset-2">View →</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!selected && !showClaimForm} onClose={() => setSelected(null)} title={`Order — ${selected?.order_number ?? selected?.id?.slice(0, 8)}`} width="max-w-md">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-medium text-slate-500">Status</p><p className="mt-0.5"><Badge tone={STATUS_BADGE[selected.status] ?? "slate"}>{selected.status}</Badge></p></div>
              {selected.quantity != null && <div><p className="text-xs font-medium text-slate-500">Quantity</p><p className="mt-0.5 font-semibold">{selected.quantity}</p></div>}
              {selected.items && <div className="col-span-2"><p className="text-xs font-medium text-slate-500">Items / Description</p><p className="mt-0.5 text-xs">{selected.items}</p></div>}
              {selected.notes && <div className="col-span-2"><p className="text-xs font-medium text-slate-500">Notes</p><p className="mt-0.5 text-xs">{selected.notes}</p></div>}
              {selected.total_amount && <div><p className="text-xs font-medium text-slate-500">Amount</p><p className="mt-0.5">₹{Number(selected.total_amount).toLocaleString("en-IN")}</p></div>}
              <div><p className="text-xs font-medium text-slate-500">Placed On</p><p className="mt-0.5">{fmt(selected.requested_at || selected.created_at)}</p></div>
              {selected.required_by && <div><p className="text-xs font-medium text-slate-500">Required By</p><p className="mt-0.5 font-medium text-amber-700">{fmt(selected.required_by)}</p></div>}
            </div>
            <hr className="border-slate-200" />
            <div className="flex flex-wrap gap-2">
              {selected.status === "delivered" && (
                <Button onClick={() => setShowClaimForm(true)} variant="danger">Raise Claim</Button>
              )}
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showClaimForm} onClose={() => setShowClaimForm(false)} title={`Raise Claim — Order ${selected?.order_number ?? selected?.id?.slice(0, 8)}`} width="max-w-md">
        <form onSubmit={raiseClaim} className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Describe the damage in this shipment.</p>
          <Input id="claim-sku" label="SKU / Item Code" placeholder="e.g. STL-CHASSIS-A" value={claimSku} onChange={(e) => setClaimSku(e.target.value)} required />
          <Input id="claim-damage" label="Damage Type" placeholder="e.g. Broken, Missing, Wet damage" value={claimDamageType} onChange={(e) => setClaimDamageType(e.target.value)} required />
          <Input id="claim-qty" label="Damaged Quantity" type="number" min="1" value={claimDamagedQty} onChange={(e) => setClaimDamagedQty(e.target.value)} required />
          <Input id="claim-text" label="Claim Description" placeholder="Describe the issue in detail" value={claimText} onChange={(e) => setClaimText(e.target.value)} required />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowClaimForm(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={submittingClaim}>{submittingClaim ? "Submitting…" : "Submit Claim"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
