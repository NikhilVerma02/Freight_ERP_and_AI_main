import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input, Select } from "../components/ui/Input";
import type { PurchaseOrder, User } from "../lib/types";

const PO_STATUSES = ["Pending", "Acknowledged", "Dispatched", "Delivered", "Cancelled"];

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  Pending: "yellow",
  Acknowledged: "blue",
  Dispatched: "blue",
  Delivered: "green",
  Cancelled: "red",
};

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function PurchaseOrders() {
  const { user } = useAuth();
  const { show } = useToast();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [vendor, setVendor] = useState("");
  const [sku, setSku] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("1");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [creating, setCreating] = useState(false);


  const vendorName = (username: string) => {
    const v = vendors.find((u) => u.username === username);
    return v?.company_name || v?.display_name || username;
  };

  async function loadData() {
    try {
      const [pData, uData] = await Promise.all([
        api.get<PurchaseOrder[]>("/api/purchase-orders"),
        api.get<User[]>("/api/users"),
      ]);
      setPos(pData);
      setVendors(uData.filter((u) => u.role === "vendor"));
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function createPO(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) { show("error", "Select a vendor"); return; }
    setCreating(true);
    try {
      await api.post("/api/purchase-orders", {
        vendor_username: vendor,
        sku,
        item_name: itemName,
        quantity: parseInt(qty, 10),
        delivery_date: deliveryDate || null,
      });
      show("success", "Purchase order created");
      setShowCreate(false);
      setVendor(""); setSku(""); setItemName(""); setQty("1"); setDeliveryDate("");
      await loadData();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to create PO");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Orders (Purchase Orders)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">POs raised to vendors. Create, track and manage procurement orders.</p>
        </div>
        {(user?.role === "admin" || user?.role === "procurement_officer") && (
          <Button onClick={() => setShowCreate(true)}>+ New Purchase Order</Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm dark:divide-navy-700">
            <thead className="bg-slate-50 dark:bg-navy-900">
              <tr>
                {["PO Number", "Vendor", "SKU", "Item", "Qty", "Total Cost", "Status", "Delivery Date", "Raised", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : pos.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No purchase orders yet.</td></tr>
              ) : (
                pos.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/70 dark:hover:bg-navy-700/50 cursor-pointer" onClick={() => setSelected(po)}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{po.po_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{vendorName(po.vendor_username)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{po.sku}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{po.item_name}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{po.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {po.total_cost != null ? `₹${Number(po.total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_BADGE[po.status] ?? "slate"}>{po.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(po.delivery_date)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDateTime(po.date_raised)}</td>
                    <td className="px-4 py-3 text-right"><span className="text-xs text-accent underline underline-offset-2">View →</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`PO — ${selected?.po_number}`} width="max-w-md">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-medium text-slate-500">Vendor</p><p className="mt-0.5 text-slate-900 dark:text-slate-100">{vendorName(selected.vendor_username)}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Status</p><p className="mt-0.5"><Badge tone={STATUS_BADGE[selected.status] ?? "slate"}>{selected.status}</Badge></p></div>
              <div><p className="text-xs font-medium text-slate-500">SKU</p><p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">{selected.sku}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Item</p><p className="mt-0.5 text-slate-900 dark:text-slate-100">{selected.item_name}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Qty</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{selected.quantity}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Delivery Date</p><p className="mt-0.5">{formatDate(selected.delivery_date)}</p></div>
              {selected.cost_per_unit != null && (
                <div><p className="text-xs font-medium text-slate-500">Cost / Unit</p><p className="mt-0.5 text-slate-900 dark:text-slate-100">₹{selected.cost_per_unit}</p></div>
              )}
              {selected.total_cost != null && (
                <div><p className="text-xs font-medium text-slate-500">Total Cost</p><p className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">₹{Number(selected.total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
              )}
            </div>
            {selected.status !== "Delivered" && (
              <p className="text-xs text-slate-500 bg-slate-50 dark:bg-navy-900 rounded-lg px-3 py-2 ring-1 ring-slate-200 dark:ring-navy-700">
                The vendor will mark this PO as <strong>Delivered</strong> from their portal, which automatically updates their inventory.
              </p>
            )}
            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Purchase Order" width="max-w-md">
        <form onSubmit={createPO} className="flex flex-col gap-4">
          <Select id="po-vendor" label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} required>
            <option value="">Select vendor…</option>
            {vendors.map((v) => <option key={v.username} value={v.username}>{v.company_name || v.display_name}</option>)}
          </Select>
          <Input id="po-sku" label="SKU" placeholder="e.g. STL-CHASSIS-A" value={sku} onChange={(e) => setSku(e.target.value)} required />
          <Input id="po-item" label="Item Name" placeholder="e.g. Steel Chassis Frame A" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
          <Input id="po-qty" label="Quantity" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <Input id="po-date" label="Required By" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-200 dark:hover:bg-navy-700">Cancel</button>
            <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create PO"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
