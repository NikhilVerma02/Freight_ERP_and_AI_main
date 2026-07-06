import React, { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { Input, Select } from "../components/ui/Input";
import type { VendorInventoryItem } from "../lib/types";

interface FormState {
  vendor_username: string;
  sku: string;
  item_name: string;
  qty_on_hand: number;
  reorder_threshold: number;
  manufacturing_critical: boolean;
}

const EMPTY: FormState = {
  vendor_username: "",
  sku: "",
  item_name: "",
  qty_on_hand: 0,
  reorder_threshold: 0,
  manufacturing_critical: false,
};

export default function VendorInventory() {
  const { user } = useAuth();
  const { show } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "warehouse";
  const isReadOnly = user?.role === "inventory_controller";
  const [items, setItems] = useState<VendorInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorFilter, setVendorFilter] = useState("");

  const [editing, setEditing] = useState<VendorInventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.get<VendorInventoryItem[]>("/api/vendor_inventory"));
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(item: VendorInventoryItem) {
    setEditing(item);
    setForm({
      vendor_username: item.vendor_username,
      sku: item.sku,
      item_name: item.item_name,
      qty_on_hand: item.qty_on_hand,
      reorder_threshold: item.reorder_threshold,
      manufacturing_critical: item.manufacturing_critical,
    });
    setModalOpen(true);
  }

  async function save() {
    try {
      if (editing) {
        await api.put(`/api/vendor_inventory/${editing.id}`, {
          sku: form.sku,
          item_name: form.item_name,
          qty_on_hand: form.qty_on_hand,
          reorder_threshold: form.reorder_threshold,
          manufacturing_critical: form.manufacturing_critical,
        });
        show("success", "Item updated");
      } else {
        const body: Record<string, unknown> = {
          sku: form.sku,
          item_name: form.item_name,
          qty_on_hand: form.qty_on_hand,
          reorder_threshold: form.reorder_threshold,
          manufacturing_critical: form.manufacturing_critical,
        };
        if (isAdmin) body.vendor_username = form.vendor_username;
        await api.post("/api/vendor_inventory", body);
        show("success", "Item created");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to save item");
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    try {
      await api.delete(`/api/vendor_inventory/${deleteId}`);
      show("success", "Item deleted");
      setDeleteId(null);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  const vendors = useMemo(
    () => Array.from(new Set(items.map((i) => i.vendor_username))),
    [items]
  );
  const visible = useMemo(
    () => items.filter((i) => !vendorFilter || i.vendor_username === vendorFilter),
    [items, vendorFilter]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {isAdmin ? "Vendor Inventory" : isReadOnly ? "Vendor Inventory" : "My Inventory"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin || isReadOnly ? "Stock levels across all vendors." : "Sellable stock you have on hand."}
          </p>
        </div>
        {!isReadOnly && <Button onClick={openCreate}>+ New Item</Button>}
      </div>

      {isAdmin && (
        <Select label="Vendor" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="max-w-xs">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No inventory items.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((i) => {
            const low = i.qty_on_hand <= i.reorder_threshold;
            return (
              <Card key={i.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{i.item_name}</span>
                  {low && <Badge tone="red" dot>low</Badge>}
                </div>
                <span className="text-xs text-slate-500">
                  {i.sku}
                  {isAdmin ? ` · ${i.vendor_username}` : ""}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={low ? "red" : "green"}>{i.qty_on_hand} on hand</Badge>
                  <Badge tone="slate">reorder @ {i.reorder_threshold}</Badge>
                  {(i.damaged_qty ?? 0) > 0 && <Badge tone="yellow">{i.damaged_qty} damaged</Badge>}
                  {i.manufacturing_critical && <Badge tone="purple">critical</Badge>}
                </div>
                {!isReadOnly && (
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(i)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteId(i.id)}>Delete</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Item" : "New Item"}>
        <div className="flex flex-col gap-3">
          {isAdmin && !editing && (
            <Input
              label="Vendor username"
              value={form.vendor_username}
              onChange={(e) => setForm({ ...form, vendor_username: e.target.value })}
            />
          )}
          <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input label="Item name" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
          <Input
            label="Qty on hand"
            type="number"
            value={form.qty_on_hand}
            onChange={(e) => setForm({ ...form, qty_on_hand: parseInt(e.target.value || "0", 10) })}
          />
          <Input
            label="Reorder threshold"
            type="number"
            value={form.reorder_threshold}
            onChange={(e) => setForm({ ...form, reorder_threshold: parseInt(e.target.value || "0", 10) })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.manufacturing_critical}
              onChange={(e) => setForm({ ...form, manufacturing_critical: e.target.checked })}
            />
            Manufacturing critical
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        message="Delete this inventory item? This cannot be undone."
      />
    </div>
  );
}
