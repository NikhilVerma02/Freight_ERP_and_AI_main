import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../lib/api";
import { Badge, statusToTone, Button, Card, CardBody, CodeBlock } from "../components/ui";
import { Table, Thead, Tbody, Tr, Th, Td } from "../components/ui/Table";
import { LoadingOverlay } from "../components/ui/Spinner";
import type { AgentLogEntry } from "../lib/types";

export default function LogsExceptions() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AgentLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  function load(failed: boolean) {
    setLogs(null);
    setError(null);
    const path = failed ? "/api/logs?status=failed" : "/api/logs";
    api
      .get<AgentLogEntry[]>(path)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }

  useEffect(() => {
    load(failedOnly);
  }, [failedOnly]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold ai-text-primary">{t("logs.title")}</h1>
          <p className="mt-1 text-sm ai-text-secondary">{t("logs.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={!failedOnly ? "primary" : "secondary"} size="sm" onClick={() => setFailedOnly(false)}>
            {t("logs.all")}
          </Button>
          <Button variant={failedOnly ? "danger" : "secondary"} size="sm" onClick={() => setFailedOnly(true)}>
            {t("logs.exceptionsOnly")}
          </Button>
        </div>
      </div>

      <Card>
        <CardBody>
          {error && <div className="text-sm text-rose-400">{error}</div>}
          {!logs && !error && <LoadingOverlay label={t("common.loading")} />}
          {logs && logs.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">{t("logs.empty")}</div>
          )}
          {logs && logs.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("logs.runId")}</Th>
                  <Th>{t("logs.agent")}</Th>
                  <Th>{t("logs.status")}</Th>
                  <Th>{t("logs.timestamp")}</Th>
                  <Th>{t("logs.latency")}</Th>
                  <Th>{"Â "}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log, i) => (
                  <React.Fragment key={i}>
                    <Tr>
                      <Td className="font-mono text-xs">{log.run_id}</Td>
                      <Td>{log.agent}</Td>
                      <Td>
                        <Badge tone={statusToTone(log.status)}>{log.status}</Badge>
                      </Td>
                      <Td className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</Td>
                      <Td className="text-xs">{log.latency_ms ? `${log.latency_ms.toFixed(0)}ms` : "â€”"}</Td>
                      <Td>
                        <button
                          onClick={() => setExpanded(expanded === i ? null : i)}
                          className="text-xs text-accent-400 hover:underline"
                        >
                          {expanded === i ? t("logs.collapse") : t("logs.expand")}
                        </button>
                      </Td>
                    </Tr>
                    {expanded === i && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 dark:bg-slate-950/60 px-4 py-3">
                          {log.error && (
                            <div className="mb-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                              {log.error}
                            </div>
                          )}
                          <CodeBlock data={log} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}


