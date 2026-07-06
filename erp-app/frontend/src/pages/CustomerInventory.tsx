import React, { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Input";
import type { CustomerInventoryItem } from "../lib/types";

export default function CustomerInventory() {
  const { user } = useAuth();
  const { show } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "warehouse";
  const [items, setItems] = useState<CustomerInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerFilter, setCustomerFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setItems(await api.get<CustomerInventoryItem[]>("/api/customer_inventory"));
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load inventory");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const customers = useMemo(
    () => Array.from(new Set(items.map((i) => i.customer_username))),
    [items]
  );
  const vendors = useMemo(
    () => Array.from(new Set(items.map((i) => i.vendor_username))),
    [items]
  );
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (!customerFilter || i.customer_username === customerFilter) &&
          (!vendorFilter || i.vendor_username === vendorFilter)
      ),
    [items, customerFilter, vendorFilter]
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {isAdmin ? "Customer Inventory" : "My Inventory"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isAdmin
            ? "Received stock held by all customers (read-only)."
            : "Stock you've received from your vendors (read-only)."}
        </p>
      </div>

      {isAdmin && (
        <div className="flex gap-3">
          <Select label="Customer" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select label="Vendor" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No inventory yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((i) => (
            <Card key={i.id} className="flex flex-col gap-2 p-4">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{i.item_name}</span>
              <span className="text-xs text-slate-500">
                {i.sku} · from {i.vendor_username}
                {isAdmin ? ` · held by ${i.customer_username}` : ""}
              </span>
              <Badge tone="green">{i.qty_on_hand} on hand</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
