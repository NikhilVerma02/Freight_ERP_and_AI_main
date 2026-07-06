import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Input";
import type { SalesOrder } from "../lib/types";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  Dispatched: "blue",
  "In Transit": "blue",
  Delivered: "green",
  Returned: "red",
};

const SO_STATUSES = ["Dispatched", "In Transit", "Delivered", "Returned"];

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SalesOrders() {
  const { show } = useToast();
  const [sos, setSos] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SalesOrder | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get<SalesOrder[]>("/api/sales-orders");
      setSos(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load sales orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openSO(so: SalesOrder) {
    setSelected(so);
    setEditStatus(so.status);
  }

  async function saveStatus() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/api/sales-orders/${selected.id}`, { status: editStatus });
      show("success", "Status updated");
      setSelected(null);
      await load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Sales Orders</h1>
        <p className="text-sm text-slate-500 mt-1">SOs generated when you dispatch a purchase order. Update delivery status here.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["SO Number", "PO Number", "Status", "Dispatched", "Delivered", "Notes", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : sos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No sales orders yet. Dispatch a PO to create one.</td></tr>
              ) : (
                sos.map((so) => (
                  <tr key={so.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openSO(so)}>
                    <td className="px-4 py-3 font-mono font-medium text-emerald-700 whitespace-nowrap">{so.so_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{so.po_number}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_BADGE[so.status] ?? "slate"}>{so.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(so.dispatched_at)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(so.delivered_at)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{so.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-right"><span className="text-xs text-accent underline underline-offset-2">Update →</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Update SO — ${selected?.so_number}`} width="max-w-md">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-medium text-slate-500">SO Number</p><p className="mt-0.5 font-mono text-emerald-600">{selected.so_number}</p></div>
              <div><p className="text-xs font-medium text-slate-500">PO Number</p><p className="mt-0.5 font-mono">{selected.po_number}</p></div>
              <div><p className="text-xs font-medium text-slate-500">Dispatched</p><p className="mt-0.5">{fmt(selected.dispatched_at)}</p></div>
              {selected.notes && <div className="col-span-2"><p className="text-xs font-medium text-slate-500">Notes</p><p className="mt-0.5 text-xs">{selected.notes}</p></div>}
            </div>
            <hr className="border-slate-200" />
            <Select id="so-status" label="Update Status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              {SO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={saveStatus} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
