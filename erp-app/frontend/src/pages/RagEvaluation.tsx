import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { RagEvalDetail, RagEvalSummary } from "../lib/types";

interface RunStatus {
  running: boolean;
  exit_code: number | null;
  log_tail: string;
}

const METRIC_LABELS: Record<string, string> = {
  faithfulness: "Faithfulness",
  answer_relevancy: "Answer Relevancy",
  context_precision: "Context Precision",
  context_recall: "Context Recall",
};

function scoreTone(value: number | undefined): "green" | "yellow" | "red" | "slate" {
  if (value === undefined || value === null) return "slate";
  if (value >= 0.8) return "green";
  if (value >= 0.5) return "yellow";
  return "red";
}

function ScoreBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <Badge tone="slate">—</Badge>;
  return <Badge tone={scoreTone(value)}>{value.toFixed(2)}</Badge>;
}

export default function RagEvaluation() {
  const { hasRole } = useAuth();
  const { show } = useToast();
  const [runs, setRuns] = useState<RagEvalSummary[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RagEvalDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback(() => {
    api
      .get<RagEvalSummary[]>("/api/observability/rag-eval")
      .then((data) => {
        setRuns(data);
        setSelectedRunId((prev) => prev ?? (data.length > 0 ? data[0].run_id : null));
        return data;
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load eval runs"));
  }, [show]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const pollStatus = useCallback(() => {
    api
      .get<RunStatus>("/api/observability/rag-eval/run/status")
      .then((status) => {
        setRunStatus(status);
        if (!status.running) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          loadRuns();
          setSelectedRunId(null); // jump to the newest run once it lands
        }
      })
      .catch(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      });
  }, [loadRuns]);

  // Pick up an already-running eval on page load (e.g. triggered earlier, or by someone else).
  useEffect(() => {
    pollStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRerun = () => {
    api
      .post("/api/observability/rag-eval/run")
      .then(() => {
        show("success", "Evaluation started — this takes a few minutes.");
        setRunStatus({ running: true, exit_code: null, log_tail: "" });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(pollStatus, 5000);
      })
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to start evaluation"));
  };

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    api
      .get<RagEvalDetail>(`/api/observability/rag-eval/${selectedRunId}`)
      .then(setDetail)
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load run detail"))
      .finally(() => setLoadingDetail(false));
  }, [selectedRunId, show]);

  const chartData = detail
    ? Object.entries(detail.averages).map(([key, value]) => ({
        name: METRIC_LABELS[key] || key,
        value: Math.round((value ?? 0) * 1000) / 1000,
        color: (value ?? 0) >= 0.8 ? "#10b981" : (value ?? 0) >= 0.5 ? "#f59e0b" : "#ef4444",
      }))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">RAG Quality Evaluation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ragas scorecards measuring how faithful and relevant the SLA Q&amp;A assistant's answers are,
            scored against a fixed test set using a free LLM judge (Groq).
          </p>
        </div>
        {hasRole("admin", "warehouse") && (
          <button
            onClick={handleRerun}
            disabled={!!runStatus?.running}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
              runStatus?.running
                ? "cursor-not-allowed bg-cyan-400/60"
                : "bg-cyan-600 hover:bg-cyan-700"
            }`}
          >
            {runStatus?.running ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Running…
              </>
            ) : (
              "Re-run Evaluation"
            )}
          </button>
        )}
      </div>

      {runStatus?.running && (
        <Card className={`border-l-4 p-3 text-xs text-slate-500 dark:text-slate-400 ${ENTITY_COLORS.evaluation.bar}`}>
          Evaluation in progress — indexing test SLAs, asking questions, then scoring with the Groq judge.
          This usually takes 2–4 minutes; the page will refresh automatically when it's done.
        </Card>
      )}

      {runs === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : runs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No evaluation runs yet. Run <code>scripts/eval_rag.py</code> in erp-app/backend to generate one.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Run list */}
          <div className="flex flex-col gap-2 lg:col-span-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Runs</h2>
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2">
              {runs.map((r) => (
                <motion.button
                  key={r.run_id}
                  variants={fadeUpItem}
                  onClick={() => setSelectedRunId(r.run_id)}
                  className={`text-left ${selectedRunId === r.run_id ? "" : ""}`}
                >
                  <Card
                    hoverable
                    className={`border-l-4 p-3 ${ENTITY_COLORS.evaluation.bar} ${
                      selectedRunId === r.run_id ? "ring-2 ring-cyan-400/40" : ""
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.run_id}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{r.question_count} questions</p>
                  </Card>
                </motion.button>
              ))}
            </motion.div>
          </div>

          {/* Selected run detail */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            {loadingDetail ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : detail ? (
              <>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-2 gap-4 sm:grid-cols-4"
                >
                  {Object.entries(detail.averages).map(([key, value]) => (
                    <motion.div key={key} variants={fadeUpItem}>
                      <Card className={`overflow-hidden border-l-4 p-4 ${ENTITY_COLORS.evaluation.bar}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {METRIC_LABELS[key] || key}
                        </p>
                        <p className="mt-1 text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                          {((value ?? 0) * 100).toFixed(0)}%
                        </p>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>

                <Card className={`border-l-4 p-4 ${ENTITY_COLORS.evaluation.bar}`}>
                  <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Average Score by Metric
                  </h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Per-Question Breakdown
                  </h3>
                  <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
                    {detail.rows.map((row, i) => (
                      <motion.div key={i} variants={fadeUpItem}>
                        <Card className="p-4">
                          <p className="text-sm text-slate-800 dark:text-slate-200">{row.user_input}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs">
                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              Faithfulness <ScoreBadge value={row.faithfulness} />
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              Relevancy <ScoreBadge value={row.answer_relevancy} />
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              Precision <ScoreBadge value={row.context_precision} />
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              Recall <ScoreBadge value={row.context_recall} />
                            </span>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
