import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../lib/api";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AGENT_COLORS, STAT_HEX } from "../lib/colors";
import { AGENT_META, STEP_KEYS, StepKey } from "../lib/agentFacts";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { KpiSummary } from "../lib/types";

// ── tiny helpers ──────────────────────────────────────────────────────────────

function agentHex(name: string): string {
  const key = name.replace("_agent", "") as StepKey;
  return AGENT_COLORS[key]?.hex || "#22d3ee";
}

function agentLabel(name: string): string {
  return name.replace("_agent", "");
}

const TOOLTIP_STYLE = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

// ── stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  hex,
  icon,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  hex: string;
  icon: string;
  sub?: string;
}) {
  return (
    <motion.div variants={fadeUpItem}>
      <div
        className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur"
        style={{ boxShadow: `0 0 0 1px ${hex}18, 0 4px 24px ${hex}10` }}
      >
        {/* glow blob */}
        <div
          className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 blur-2xl"
          style={{ background: hex }}
        />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold font-mono" style={{ color: hex }}>
              {value}
            </p>
            {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
          </div>
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl"
            style={{ background: `${hex}18`, border: `1px solid ${hex}30` }}
          >
            {icon}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">{children}</h2>
  );
}

// ── run outcome donut with center label ───────────────────────────────────────

function RunOutcomeDonut({ data, total }: { data: { name: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="relative" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={88}
            paddingAngle={3}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      {/* center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono text-slate-100">{total}</span>
        <span className="text-xs text-slate-500">total runs</span>
      </div>
    </div>
  );
}

// ── agent success radial ───────────────────────────────────────────────────────

function AgentSuccessRadial({ data }: { data: { name: string; success_rate: number; color: string }[] }) {
  const radial = data.map((d) => ({ ...d, fill: d.color }));
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="20%"
          outerRadius="90%"
          data={radial}
          startAngle={180}
          endAngle={0}
          barSize={10}
        >
          <RadialBar dataKey="success_rate" cornerRadius={4} background={{ fill: "#1e293b" }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v}%`, "Success rate"]}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── latency bar chart ─────────────────────────────────────────────────────────

function LatencyChart({ data }: { data: { name: string; avg_latency_ms: number; color: string }[] }) {
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={24}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={48}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v.toFixed(0)} ms`, "Avg latency"]}
          />
          <Bar dataKey="avg_latency_ms" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── per-agent card ─────────────────────────────────────────────────────────────

function AgentCard({ name, a }: { name: string; a: KpiSummary["per_agent"][string] }) {
  const key = name.replace("_agent", "") as StepKey;
  const meta = AGENT_META[key];
  const palette = AGENT_COLORS[key];
  const hex = palette?.hex || "#22d3ee";
  const successPct = Math.round(a.success_rate * 100);
  const latency = a.avg_latency_ms != null ? `${Number(a.avg_latency_ms).toFixed(0)} ms` : "—";

  // mini spark: success bar fill
  const sparkData = [
    { v: successPct, fill: hex },
    { v: 100 - successPct, fill: "#1e293b" },
  ];

  return (
    <motion.div variants={fadeUpItem}>
      <div
        className="group relative overflow-hidden rounded-xl border bg-slate-900/80 p-4 transition-shadow hover:shadow-lg"
        style={{
          borderColor: `${hex}30`,
          boxShadow: `0 0 0 1px ${hex}10`,
        }}
      >
        {/* accent stripe */}
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl" style={{ background: hex }} />

        <div className="flex items-center gap-2 pl-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
            style={{ background: `${hex}18`, border: `1px solid ${hex}25` }}
          >
            {meta?.icon || "🤖"}
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-200">{agentLabel(name)}</p>
            <p className="text-[10px] text-slate-500">{a.total_calls} call{a.total_calls !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-3 pl-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Success</span>
            <span className="text-xs font-mono font-semibold" style={{ color: hex }}>{successPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${successPct}%`, background: hex }} />
          </div>
        </div>

        <div className="mt-3 pl-2 grid grid-cols-2 gap-1">
          <div>
            <p className="text-[10px] text-slate-500">Avg latency</p>
            <p className="text-xs font-mono text-slate-300">{latency}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">Tokens est.</p>
            <p className="text-xs font-mono text-slate-300">{a.total_token_estimate ?? "—"}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── main dashboard ─────────────────────────────────────────────────────────────

export default function KpiDashboard() {
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<KpiSummary>("/api/kpi/summary")
      .then(setKpi)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        <span>⚠️</span> {error}
      </div>
    );
  }
  if (!kpi) return <LoadingOverlay label={t("common.loading")} />;

  const agentNames = Object.keys(kpi.per_agent);
  const latencyData = agentNames.map((name) => ({
    name: agentLabel(name),
    avg_latency_ms: kpi.per_agent[name].avg_latency_ms ?? 0,
    color: agentHex(name),
  }));
  const successData = agentNames.map((name) => ({
    name: agentLabel(name),
    success_rate: Math.round(kpi.per_agent[name].success_rate * 100),
    color: agentHex(name),
  }));
  const partialRuns = Math.max(0, kpi.total_runs - kpi.successful_runs - kpi.failed_runs);
  const runStatusData = [
    { name: "completed", value: kpi.successful_runs, color: "#34d399" },
    { name: "partial", value: partialRuns, color: "#fbbf24" },
    { name: "failed", value: kpi.failed_runs, color: "#fb7185" },
  ].filter((d) => d.value > 0);

  const successRatePct = kpi.run_success_rate !== null ? Math.round(kpi.run_success_rate * 100) : null;

  return (
    <div className="space-y-8">
      {/* page header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
            style={{ background: "#3b82f618", border: "1px solid #3b82f630" }}
          >
            📊
          </div>
          <div>
            <h1 className="text-xl font-bold ai-text-primary">{t("kpi.title")}</h1>
            <p className="text-xs ai-text-secondary">{t("kpi.subtitle")}</p>
          </div>
        </div>
      </motion.div>

      {/* stat tiles */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <StatTile
          label={t("kpi.totalRuns")}
          value={kpi.total_runs}
          hex={STAT_HEX.blue}
          icon="🚀"
          sub={`${kpi.successful_runs} completed`}
        />
        <StatTile
          label={t("kpi.successRate")}
          value={successRatePct !== null ? `${successRatePct}%` : "N/A"}
          hex={successRatePct !== null && successRatePct >= 70 ? STAT_HEX.emerald : STAT_HEX.rose}
          icon="✅"
          sub={`${kpi.failed_runs} failed`}
        />
        <StatTile
          label={t("kpi.totalClaims")}
          value={kpi.successful_runs}
          hex={STAT_HEX.violet}
          icon="🧾"
          sub="claims drafted"
        />
        <StatTile
          label="Log Entries"
          value={kpi.total_log_entries}
          hex={STAT_HEX.amber}
          icon="📋"
          sub="agent steps logged"
        />
      </motion.div>

      {/* charts */}
      {agentNames.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-sm text-slate-500">
          {t("kpi.noData")}
        </div>
      ) : (
        <>
          <div>
            <SectionHeading>Pipeline Overview</SectionHeading>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-4 lg:grid-cols-3"
            >
              {/* run outcomes */}
              <motion.div variants={fadeUpItem}>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Run Outcomes</p>
                  <RunOutcomeDonut data={runStatusData} total={kpi.total_runs} />
                  <div className="mt-3 flex flex-wrap justify-center gap-3">
                    {runStatusData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-xs text-slate-400">{d.name}</span>
                        <span className="text-xs font-mono text-slate-300">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* avg latency */}
              <motion.div variants={fadeUpItem}>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">{t("kpi.avgLatency")}</p>
                  <LatencyChart data={latencyData} />
                </div>
              </motion.div>

              {/* agent success radial */}
              <motion.div variants={fadeUpItem}>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">{t("kpi.agentSuccessRate")}</p>
                  <AgentSuccessRadial data={successData} />
                  <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
                    {successData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-[10px] text-slate-400">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* per-agent cards */}
          <div>
            <SectionHeading>{t("kpi.perAgent")}</SectionHeading>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {agentNames.map((name) => (
                <AgentCard key={name} name={name} a={kpi.per_agent[name]} />
              ))}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
