import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Badge, statusToTone, Card, CardBody } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AgentFlowCard } from "../components/AgentFlowCard";
import { AGENT_META, STEP_KEYS, buildFacts, StepKey } from "../lib/agentFacts";
import type { AgentLogEntry, RunDetail } from "../lib/types";

const AGENT_NAME_BY_KEY: Record<StepKey, string> = {
  inspector: "inspector_agent",
  context: "context_agent",
  policy: "policy_agent",
  inventory: "inventory_agent",
  reorder: "reorder_agent",
  claim: "claim_agent",
  governance: "governance_agent",
};

function findStep(steps: AgentLogEntry[], agent: string): AgentLogEntry | undefined {
  return steps.find((s) => s.agent === agent);
}

export default function CaseDetail() {
  const { t } = useTranslation();
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    setData(null);
    setError(null);
    api
      .get<RunDetail>(`/api/ingest/runs/${runId}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, [runId]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/history" className="text-sm text-accent-400 hover:underline">â† {t("detail.back")}</Link>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {t("detail.loadError")}: {error}
        </div>
      </div>
    );
  }

  if (!data) return <LoadingOverlay label={t("common.loading")} />;

  const { run, steps } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/history" className="text-sm text-accent-400 hover:underline">â† {t("detail.back")}</Link>

      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold ai-text-primary">{t("detail.title")}</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">{run.run_id}</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">{t("detail.overallStatus")}</div>
            <Badge tone={statusToTone(run.status)} className="mt-1">{run.status}</Badge>
          </div>
        </CardBody>
      </Card>

      <div>
        {STEP_KEYS.map((key, i) => {
          const step = findStep(steps, AGENT_NAME_BY_KEY[key]);
          const meta = AGENT_META[key];
          const stepData = step?.output_summary;
          return (
            <AgentFlowCard
              key={key}
              agentKey={key}
              icon={meta.icon}
              title={t(meta.titleKey)}
              subtitle={t(meta.subtitleKey)}
              status={step?.status}
              facts={buildFacts(key, stepData, t)}
              emptyMessage={t(meta.emptyKey)}
              error={step?.error}
              raw={stepData}
              isLast={i === STEP_KEYS.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}


