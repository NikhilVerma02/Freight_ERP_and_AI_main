import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type { Order, Claim, Alert } from "../lib/types";

const ORDER_STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  requested: "yellow",
  confirmed: "blue",
  processing: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

const CLAIM_STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
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

export default function Dashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, a] = await Promise.all([
          api.get<Order[]>("/api/orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<Alert[]>("/api/alerts"),
        ]);
        setOrders(o);
        setClaims(c);
        setAlerts(a);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  if (loading) return <div className="text-slate-400 py-10 text-center">Loading…</div>;

  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const pendingClaims = claims.filter((c) => c.status === "pending").length;
  const unreadAlerts = alerts.filter((a) => a.status === "unread").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.display_name}</h1>
        <p className="text-sm text-slate-500 mt-1">Track your orders, claims and inventory.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Orders", value: orders.length, icon: "📦", color: "text-violet-600" },
          { label: "Active Orders", value: activeOrders, icon: "🚚", color: "text-blue-600" },
          { label: "Open Claims", value: pendingClaims, icon: "⚠️", color: "text-red-600" },
          { label: "Unread Alerts", value: unreadAlerts, icon: "🔔", color: "text-amber-600" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label} className="flex items-center gap-4">
            <span className="text-3xl">{icon}</span>
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-400">No orders yet. <a href="/new-order" className="text-accent hover:underline">Place one →</a></p>
          ) : (
            <table className="w-full text-sm divide-y divide-slate-100">
              <thead><tr>{["Order #", "Vendor", "Status", "Date"].map((h) => <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {orders.slice(0, 5).map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 font-mono text-xs">{o.order_number ?? o.id.slice(0, 8)}</td>
                    <td className="py-2 text-slate-600">{o.vendor_username}</td>
                    <td className="py-2"><Badge tone={ORDER_STATUS_BADGE[o.status] ?? "slate"}>{o.status}</Badge></td>
                    <td className="py-2 text-slate-500 text-xs whitespace-nowrap">{fmt(o.requested_at || o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-400">No alerts.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className={`rounded-lg p-3 ${a.status === "unread" ? "bg-violet-50 ring-1 ring-violet-200" : "bg-slate-50"}`}>
                  <p className="text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
