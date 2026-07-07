import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, statusToTone, Card } from "./ui";
import { Spinner } from "./ui/Spinner";
import { CodeBlock } from "./ui/CodeBlock";
import { AGENT_COLORS } from "../lib/colors";
import type { Fact } from "../lib/agentFacts";
import type { StepKey } from "../lib/agentFacts";

interface AgentFlowCardProps {
  agentKey: StepKey;
  icon: string;
  title: string;
  subtitle: string;
  status: "pending" | "running" | "ok" | "failed" | string | undefined;
  facts: Fact[];
  emptyMessage: string;
  error?: string | null;
  raw?: unknown;
  isLast?: boolean;
}

/** One step in the agentic pipeline flow — icon + connecting line on the left, a card with a
 * status badge and a handful of concise facts on the right (never the full raw payload by
 * default; that's one click away via "Show full details" for anyone who wants it). Each agent
 * has its own fixed color identity (see lib/colors.ts) so the 7-step flow reads at a glance. */
export function AgentFlowCard({ agentKey, icon, title, subtitle, status, facts, emptyMessage, error, raw, isLast }: AgentFlowCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isPending = status === "pending";
  const isRunning = status === "running";
  const isWaitingOrRunning = isPending || isRunning;
  const palette = AGENT_COLORS[agentKey];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-4"
    >
      <div className="flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${
              isRunning
                ? `${palette.ring} ${palette.iconBg} shadow-glow animate-pulse`
                : isPending
                ? "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500"
                : status === "failed"
                ? "border-rose-500/40 bg-rose-500/10"
                : `${palette.ring} ${palette.iconBg}`
            }`}
          >
            {isWaitingOrRunning ? <Spinner size={16} /> : icon}
          </motion.div>
        </AnimatePresence>
        {!isLast && <div className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-800" />}
      </div>

      <Card
        className={`mb-5 flex-1 min-w-0 overflow-hidden border-t-2 ${isPending ? "opacity-50" : "opacity-100"} transition-opacity duration-300`}
        style={{ borderTopColor: isPending ? undefined : palette.hex }}
      >
        <div className="flex items-center justify-between ai-card-header px-4 py-3">
          <div>
            <div className="text-sm font-semibold ai-text-primary">{title}</div>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: palette.hex }}>
              {subtitle}
            </div>
          </div>
          {isRunning ? (
            <Badge tone="running">{t("common.running")}</Badge>
          ) : (
            !isPending && status && <Badge tone={statusToTone(status)}>{status}</Badge>
          )}
        </div>

        <div className="px-4 py-3">
          {isWaitingOrRunning ? (
            <p className="text-sm ai-text-muted">{isRunning ? `${t("common.running")}…` : t("detail.waitingTurn")}</p>
          ) : error ? (
            <p className="text-sm text-rose-300">
              {t("detail.error")}: {error}
            </p>
          ) : facts.length === 0 ? (
            <p className="text-sm ai-text-muted">{emptyMessage}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {facts.map((f, i) => (
                <div
                  key={i}
                  className={
                    f.colSpan === 4 ? "col-span-2 sm:col-span-4" :
                    f.colSpan === 2 ? "col-span-2" :
                    facts.length === 1 ? "col-span-2 sm:col-span-4" : ""
                  }
                >
                  <dt className="text-xs font-medium uppercase tracking-wide ai-text-muted">{f.label}</dt>
                  <dd className="mt-0.5 ai-text-primary break-words overflow-wrap-anywhere">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {!isWaitingOrRunning && raw !== undefined && raw !== null && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-xs font-medium text-accent-400 hover:text-accent-300"
            >
              {expanded ? t("detail.hideDetails") : t("detail.showDetails")}
            </button>
          )}
          {expanded && raw !== undefined && raw !== null && <CodeBlock data={raw} className="mt-2 max-h-72" />}
        </div>
      </Card>
    </motion.div>
  );
}
