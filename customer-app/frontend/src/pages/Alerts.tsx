import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type { Alert } from "../lib/types";

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("en-GB");
}

export default function Alerts() {
  const { show } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api.get<Alert[]>("/api/alerts");
      setAlerts(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    try {
      await api.post(`/api/alerts/${id}/read`, {});
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: "read" } : a));
    } catch {}
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Alerts</h1>
        <p className="text-sm text-slate-500 mt-1">Notifications about your orders, claims and shipments.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : alerts.length === 0 ? (
        <Card><p className="text-sm text-slate-400">No alerts.</p></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <Card key={a.id} className={`flex items-start justify-between gap-4 ${a.status === "unread" ? "border-l-4 border-l-accent" : ""}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                  {a.status === "unread" && <Badge tone="violet" dot>new</Badge>}
                </div>
                <p className="text-sm text-slate-600">{a.message}</p>
                <p className="text-xs text-slate-400 mt-1">{fmt(a.created_at)}</p>
              </div>
              {a.status === "unread" && (
                <button onClick={() => markRead(a.id)} className="shrink-0 text-xs text-slate-400 hover:text-slate-700 underline">Mark read</button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
