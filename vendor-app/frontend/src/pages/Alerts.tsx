import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Badge } from "../components/ui/Badge";
import type { Alert } from "../lib/types";

const TYPE_META: Record<string, { icon: string; label: string }> = {
  claim_raised: { icon: "⚠️", label: "Claim" },
  reorder:      { icon: "🔁", label: "Reorder" },
  new_claim:    { icon: "📋", label: "New Claim" },
  inventory:    { icon: "📦", label: "Inventory" },
};

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
      const ALLOWED = new Set(["reorder", "claim_raised", "new_claim", "inventory"]);
      setAlerts(data.filter((a) => ALLOWED.has(a.type)));
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

  async function markAllRead() {
    const unread = alerts.filter((a) => a.status === "unread");
    await Promise.allSettled(unread.map((a) => api.post(`/api/alerts/${a.id}/read`, {})));
    setAlerts((prev) => prev.map((a) => ({ ...a, status: "read" })));
  }

  const unread = alerts.filter((a) => a.status === "unread").length;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Alerts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Notifications and system alerts targeted to you.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {unread > 0 && (
            <>
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-center min-w-[64px]">
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400 leading-none">{unread}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600/70 dark:text-amber-400/70 mt-0.5">Unread</p>
              </div>
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-accent hover:underline underline-offset-2 transition-colors"
              >
                Mark all read
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 py-6">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-75" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          Loading alerts…
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-6 py-10 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">No alerts yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => {
            const meta = TYPE_META[a.type] ?? { icon: "🔔", label: a.type };
            const isUnread = a.status === "unread";
            return (
              <div
                key={a.id}
                className={`
                  relative rounded-xl border px-4 py-3.5 flex items-start gap-3 transition-colors
                  ${isUnread
                    ? "border-accent/30 bg-accent/5 dark:bg-accent/10"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"}
                `}
              >
                {/* Unread stripe */}
                {isUnread && (
                  <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-accent" />
                )}

                {/* Icon */}
                <span className="text-xl leading-none mt-0.5 shrink-0">{meta.icon}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {a.title}
                    </p>
                    {isUnread && <Badge tone="emerald" dot>new</Badge>}
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{a.message}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{fmt(a.created_at)}</p>
                </div>

                {/* Action */}
                {isUnread && (
                  <button
                    onClick={() => markRead(a.id)}
                    className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 underline underline-offset-2 transition-colors mt-0.5"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
