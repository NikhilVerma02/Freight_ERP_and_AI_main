import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import type { CustomerInventoryItem } from "../lib/types";

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Inventory() {
  const { show } = useToast();
  const [items, setItems] = useState<CustomerInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<CustomerInventoryItem[]>("/api/customer_inventory")
      .then(setItems)
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load inventory"))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = items.reduce((s, i) => s + (i.quantity * (i.unit_price ?? 0)), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Stock received from your vendors.</p>
        </div>
        {items.length > 0 && (
          <div className="rounded-lg bg-violet-50 px-4 py-2 ring-1 ring-violet-200 text-sm text-violet-700">
            Total Value: <span className="font-semibold">₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["SKU", "Item", "Vendor", "Qty", "Unit Price", "Total Value", "Updated"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No inventory items yet.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.sku}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{item.item_name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.vendor_username}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{item.unit_price ? `₹${Number(item.unit_price).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.unit_price ? `₹${(item.quantity * item.unit_price).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(item.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
