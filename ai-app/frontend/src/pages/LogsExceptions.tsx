import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { CodeBlock } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AGENT_COLORS } from "../lib/colors";
import type { AgentLogEntry } from "../lib/types";
import type { StepKey } from "../lib/agentFacts";

// ── helpers ──────────────────────────────────────────────────────────────────

function agentHex(agent: string) {
  const key = agent.replace("_agent", "") as StepKey;
  return AGENT_COLORS[key]?.hex ?? "#22d3ee";
}
function agentIcon(agent: string) {
  const icons: Record<string, string> = {
    inspector_agent: "🔍", context_agent: "🧩", policy_agent: "📜",
    inventory_agent: "📦", reorder_agent: "🔁", claim_agent: "🧾", governance_agent: "🛡️",
  };
  return icons[agent] ?? "🤖";
}
function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
function shortId(id: string) {
  return id.replace("run_", "").slice(0, 8).toUpperCase();
}

// ── status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles: Record<string, string> = {
    ok:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    failed:  "bg-rose-500/15    text-rose-400    border-rose-500/30",
    skipped: "bg-slate-500/15   text-slate-400   border-slate-600/30",
    running: "bg-amber-500/15   text-amber-400   border-amber-500/30",
  };
  const dots: Record<string, string> = {
    ok: "bg-emerald-400", failed: "bg-rose-400 animate-pulse", running: "bg-amber-400 animate-pulse",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${styles[s] ?? styles.skipped}`}>
      {dots[s] && <span className={`h-1.5 w-1.5 rounded-full ${dots[s]}`} />}
      {status}
    </span>
  );
}

// ── run-level status ──────────────────────────────────────────────────────────

function runStatus(entries: AgentLogEntry[]): "failed" | "ok" | "partial" {
  const statuses = entries.map((e) => e.status?.toLowerCase());
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "skipped")) return "partial";
  return "ok";
}

const RUN_STATUS_STYLE = {
  ok:      { bar: "from-emerald-500 to-teal-500",   badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Completed" },
  partial: { bar: "from-amber-400   to-orange-500", badge: "bg-amber-500/15   text-amber-400   border-amber-500/30",  label: "Partial"   },
  failed:  { bar: "from-rose-500    to-pink-600",   badge: "bg-rose-500/15    text-rose-400    border-rose-500/30",   label: "Failed"    },
};

// ── agent row inside a run group ──────────────────────────────────────────────

function AgentRow({ log, isLast }: { log: AgentLogEntry; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const hex  = agentHex(log.agent);
  const icon = agentIcon(log.agent);

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer
          hover:bg-slate-50 dark:hover:bg-slate-800/40
          ${!isLast ? "border-b border-slate-100 dark:border-slate-800/60" : ""}
          ${open ? "bg-slate-50 dark:bg-slate-800/30" : ""}
        `}
        onClick={() => setOpen((v) => !v)}
      >
        {/* agent icon */}
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
          style={{ background: `${hex}18`, border: `1px solid ${hex}28` }}
        >
          {icon}
        </span>

        {/* name */}
        <span className="flex-1 text-sm font-medium ai-text-primary">{log.agent}</span>

        {/* status */}
        <StatusPill status={log.status ?? "unknown"} />

        {/* latency */}
        {log.latency_ms ? (
          <span
            className="hidden sm:inline text-xs font-mono font-semibold rounded-full px-2 py-0.5"
            style={{ background: `${hex}15`, color: hex }}
          >
            {log.latency_ms.toFixed(0)} ms
          </span>
        ) : (
          <span className="hidden sm:inline text-xs text-slate-400 w-16 text-right">—</span>
        )}

        {/* chevron */}
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2 bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800">
              {log.error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                  <span>⚠️</span><span className="break-words">{log.error}</span>
                </div>
              )}
              <CodeBlock data={log} className="max-h-56" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── run group card ────────────────────────────────────────────────────────────

function RunGroup({ runId, entries }: { runId: string; entries: AgentLogEntry[] }) {
  const [open, setOpen] = useState(true);
  const status   = runStatus(entries);
  const style    = RUN_STATUS_STYLE[status];
  const ts       = entries[0]?.timestamp;
  const totalMs  = entries.reduce((s, e) => s + (e.latency_ms ?? 0), 0);
  const okCount  = entries.filter((e) => e.status?.toLowerCase() === "ok").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm">
      {/* gradient top bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${style.bar}`} />

      {/* run header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
      >
        {/* run id badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] font-bold tracking-widest text-slate-400 dark:text-slate-500">
            RUN
          </span>
          <span className="font-mono text-sm font-bold ai-text-primary">{shortId(runId)}</span>
          <span className="hidden lg:block font-mono text-[11px] text-slate-400 dark:text-slate-600 truncate">
            ({runId})
          </span>
        </div>

        <div className="flex-1" />

        {/* meta chips */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${style.badge}`}>
            {style.label}
          </span>
          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">{okCount}/{entries.length} agents ok</span>
          {totalMs > 0 && (
            <span className="hidden md:inline text-xs font-mono text-slate-400 dark:text-slate-500">
              {totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs.toFixed(0)}ms`} total
            </span>
          )}
          {ts && <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">{fmt(ts)}</span>}
        </div>

        <svg
          className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* agent rows */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }}
            exit={{ height: 0 }} transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 dark:border-slate-800">
              {entries.map((log, i) => (
                <AgentRow key={i} log={log} isLast={i === entries.length - 1} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function LogsExceptions() {
  const { t } = useTranslation();
  const [logs, setLogs]         = useState<AgentLogEntry[] | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [failedOnly, setFailed] = useState(false);

  function load(failed: boolean) {
    setLogs(null); setError(null);
    api.get<AgentLogEntry[]>(failed ? "/api/logs?status=failed" : "/api/logs")
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }
  useEffect(() => { load(failedOnly); }, [failedOnly]);

  // group by run_id preserving insertion order
  const groups: Map<string, AgentLogEntry[]> = new Map();
  for (const log of logs ?? []) {
    const arr = groups.get(log.run_id) ?? [];
    arr.push(log);
    groups.set(log.run_id, arr);
  }

  const total  = logs?.length ?? 0;
  const failed = logs?.filter((l) => l.status?.toLowerCase() === "failed").length ?? 0;
  const ok     = logs?.filter((l) => l.status?.toLowerCase() === "ok").length ?? 0;

  return (
    <div className="space-y-5">
      {/* page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold ai-text-primary">{t("logs.title")}</h1>
          <p className="mt-0.5 text-sm ai-text-secondary">{t("logs.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* summary chips */}
          {logs && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {groups.size} runs · {total} steps
              </span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-500">
                ✓ {ok} ok
              </span>
              <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-xs font-bold text-rose-500">
                ✗ {failed} failed
              </span>
            </div>
          )}

          {/* filter toggle */}
          <div className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              onClick={() => setFailed(false)}
              className={`px-4 py-2 transition-colors ${!failedOnly ? "bg-accent-500 text-white" : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              {t("logs.all")}
            </button>
            <button
              onClick={() => setFailed(true)}
              className={`px-4 py-2 transition-colors border-l border-slate-200 dark:border-slate-700 ${failedOnly ? "bg-rose-500 text-white" : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              {t("logs.exceptionsOnly")}
            </button>
          </div>
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          ⚠️ {error}
        </div>
      )}

      {/* loading */}
      {!logs && !error && <LoadingOverlay label={t("common.loading")} />}

      {/* empty */}
      {logs && logs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 py-20 text-center text-sm text-slate-400">
          {t("logs.empty")}
        </div>
      )}

      {/* run groups */}
      {logs && logs.length > 0 && (
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([runId, entries]) => (
            <RunGroup key={runId} runId={runId} entries={entries} />
          ))}
        </div>
      )}
    </div>
  );
}
