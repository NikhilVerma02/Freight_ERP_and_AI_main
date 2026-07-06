import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import type { PurchaseOrder } from "../lib/types";

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DeliveredOrders() {
  const { show } = useToast();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [qtyToAdd, setQtyToAdd] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const data = await api.get<PurchaseOrder[]>("/api/purchase-orders");
      setPos(data.filter((po) => po.status === "Delivered"));
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openPO(po: PurchaseOrder) {
    setSelected(po);
    setQtyToAdd(String(po.quantity));
  }

  async function handleAddInventory(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const qty = parseInt(qtyToAdd, 10);
    if (!qty || qty <= 0) { show("error", "Enter a valid quantity"); return; }
    setAdding(true);
    try {
      await api.put(`/api/purchase-orders/${selected.id}/add-inventory`, { quantity: qty });
      show("success", `Added ${qty} × ${selected.item_name} (${selected.sku}) to inventory`);
      setSelected(null);
      await load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to add inventory");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Delivered Orders</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Purchase Orders marked delivered by vendors. Add received quantities to inventory.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm dark:divide-navy-700">
            <thead className="bg-slate-50 dark:bg-navy-900">
              <tr>
                {["PO Number", "Vendor", "SKU", "Item", "PO Qty", "Delivery Date", "Raised", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : pos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No delivered orders yet.</td></tr>
              ) : (
                pos.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/70 dark:hover:bg-navy-700/50 cursor-pointer" onClick={() => openPO(po)}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">{po.po_number}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{po.vendor_username}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{po.sku}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{po.item_name}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">{po.quantity}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(po.delivery_date)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(po.date_raised)}</td>
                    <td className="px-4 py-3 text-right">
                      {po.inventory_added
                        ? <Badge tone="purple">Inventory Added</Badge>
                        : <Badge tone="green">Delivered</Badge>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`${selected?.inventory_added ? "PO Details" : "Add to Inventory"} — ${selected?.po_number}`} width="max-w-md">
        {selected && (
          <form onSubmit={handleAddInventory} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-medium text-slate-500">Vendor</p><p className="mt-0.5">{selected.vendor_username}</p></div>
              <div><p className="text-xs font-medium text-slate-500">SKU</p><p className="mt-0.5 font-mono">{selected.sku}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Item</p><p className="mt-0.5">{selected.item_name}</p></div>
              <div><p className="text-xs font-medium text-slate-500">PO Quantity</p><p className="mt-0.5 font-semibold">{selected.quantity}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Delivery Date</p><p className="mt-0.5">{formatDate(selected.delivery_date)}</p></div>
            </div>

            <hr className="border-slate-200 dark:border-navy-700" />

            {selected.inventory_added ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-700 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300">
                  <span className="text-base">✅</span>
                  <span>Inventory has already been added for this PO.</span>
                </div>
                {(selected as any).damaged_qty > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300">
                    <span className="text-base">⚠️</span>
                    <span><strong>{(selected as any).damaged_qty}</strong> units were recorded as damaged (accepted {(selected as any).accepted_qty} of {selected.quantity}).</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Input
                  id="qty-add"
                  label="Accepted Quantity"
                  type="number"
                  min="1"
                  max={selected.quantity}
                  value={qtyToAdd}
                  onChange={(e) => setQtyToAdd(e.target.value)}
                  required
                />
                {(() => {
                  const accepted = parseInt(qtyToAdd, 10);
                  const damaged = !isNaN(accepted) && accepted >= 0 ? Math.max(0, selected.quantity - accepted) : null;
                  return (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-slate-500">
                        Enter the actual received (undamaged) quantity (max: {selected.quantity}). This will be added to {selected.vendor_username}'s inventory under SKU <span className="font-mono">{selected.sku}</span>.
                      </p>
                      {damaged !== null && (
                        <p className={`text-xs font-medium ${damaged > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
                          {damaged > 0 ? `⚠️ Damaged: ${damaged} unit${damaged !== 1 ? "s" : ""} (${selected.quantity} ordered − ${accepted} accepted)` : "✅ No damage — full quantity accepted"}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={() => setSelected(null)}>
                {selected.inventory_added ? "Close" : "Cancel"}
              </Button>
              {!selected.inventory_added && (
                <Button type="submit" disabled={adding}>
                  {adding ? "Adding…" : "Add to Inventory"}
                </Button>
              )}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
