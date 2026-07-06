import React, { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { AuditLog } from "../lib/types";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";

export default function AuditLogs() {
  const { show } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load(query?: string) {
    setLoading(true);
    try {
      const qs = query ? `?query=${encodeURIComponent(query)}&limit=200` : "?limit=200";
      const data = await api.get<AuditLog[]>(`/api/audit_logs${qs}`);
      setLogs(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const actionTone = (action: string) => {
    if (action === "create") return "green" as const;
    if (action === "update") return "blue" as const;
    if (action === "delete") return "red" as const;
    return "slate" as const;
  };

  const visibleLogs = useMemo(() => logs, [logs]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Audit Logs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Read-only ledger of every CRUD action — by humans and the AI agent.
        </p>
      </div>

      <Input
        placeholder="Filter by actor, action, module, or details..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-center shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none">
          <span className="text-2xl">⏳</span>
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading audit logs...</p>
        </div>
      ) : visibleLogs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-center shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none">
          <span className="text-2xl">🕒</span>
          <p className="text-sm text-slate-400 dark:text-slate-500">No audit log entries found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleLogs.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.actor}</span>
                <Badge tone={actionTone(r.action)} dot>{r.action}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {r.module}
                {r.record_id != null ? ` · #${r.record_id}` : ""}
              </p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{r.details}</p>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                {new Date(r.timestamp).toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
