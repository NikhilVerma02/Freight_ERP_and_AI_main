import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type { PurchaseOrder, Claim } from "../lib/types";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  Pending: "yellow",
  Acknowledged: "blue",
  Dispatched: "blue",
  Delivered: "green",
  Cancelled: "red",
  pending: "yellow",
  approved: "green",
  rejected: "red",
  investigating: "blue",
};

const STAT_COLORS = [
  {
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/25",
    num: "text-amber-600 dark:text-amber-400",
    icon: "📋",
  },
  {
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/25",
    num: "text-blue-600 dark:text-blue-400",
    icon: "🚚",
  },
  {
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/25",
    num: "text-red-600 dark:text-red-400",
    icon: "⚠️",
  },
  {
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/25",
    num: "text-emerald-600 dark:text-emerald-400",
    icon: "🔔",
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, c, a] = await Promise.all([
          api.get<PurchaseOrder[]>("/api/purchase-orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<{ status: string }[]>("/api/alerts"),
        ]);
        setPos(p);
        setClaims(c);
        setUnreadAlerts(a.filter((x) => x.status === "unread").length);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);
  const pendingPos = pos.filter((p) => p.status === "Pending").length;
  const dispatchedPos = pos.filter((p) => p.status === "Delivered").length;
  const pendingClaims = claims.filter((c) => c.status === "pending").length;

  const stats = [
    { label: "Pending POs",    value: pendingPos    },
    { label: "Delivered POs", value: dispatchedPos },
    { label: "Open Claims",    value: pendingClaims },
    { label: "Unread Alerts",  value: unreadAlerts  },
  ];

  if (loading) return <div className="text-slate-400 dark:text-slate-500 py-10 text-center">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Welcome, {user?.company_name || user?.display_name}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {user?.company_name ? `${user.company_name} vendor dashboard` : "Your vendor dashboard"} — purchase orders, claims and alerts.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value }, i) => {
          const c = STAT_COLORS[i];
          return (
            <div
              key={label}
              className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${c.bg} ${c.border}`}
            >
              <span className="text-3xl leading-none">{c.icon}</span>
              <div>
                <p className={`text-2xl font-bold leading-none ${c.num}`}>{value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Lower panels ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Recent POs */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Purchase Orders</h2>
          </div>
          {pos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">No purchase orders yet.</p>
          ) : (
            <table className="w-full text-sm divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["PO #", "SKU", "Qty", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {pos.slice(0, 5).map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{po.po_number}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{po.sku}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">{po.quantity}</td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_BADGE[po.status] ?? "slate"}>{po.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Recent Claims */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Claim Requests</h2>
          </div>
          {claims.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">No claims yet.</p>
          ) : (
            <table className="w-full text-sm divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Claim #", "SKU", "Damage", "Qty", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {claims.slice(0, 5).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{c.claim_number}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{c.sku}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 capitalize">{c.damage_type}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">{c.damaged_qty}</td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_BADGE[c.status] ?? "slate"}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

      </div>
    </div>
  );
}
