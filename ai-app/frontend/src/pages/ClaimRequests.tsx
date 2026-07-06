import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { Badge, Card, CardBody } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AGENT_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { ClaimRequestRecord } from "../lib/types";

function statusTone(status: string): "ok" | "failed" | "running" {
  if (status === "approved") return "ok";
  if (status === "rejected") return "failed";
  return "running";
}

export default function ClaimRequests() {
  const { t } = useTranslation();
  const [claims, setClaims] = useState<ClaimRequestRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ClaimRequestRecord[]>("/api/claims")
      .then((data) => setClaims([...data].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))))
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold ai-text-primary">{t("claimRequests.title")}</h1>
        <p className="mt-1 text-sm ai-text-secondary">{t("claimRequests.subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!claims && !error && <LoadingOverlay label={t("common.loading")} />}

      {claims && claims.length === 0 && (
        <Card>
          <CardBody className="text-center text-sm text-slate-500">{t("claimRequests.empty")}</CardBody>
        </Card>
      )}

      {claims && claims.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {claims.map((c) => (
            <motion.div key={c.id} variants={fadeUpItem}>
              <Card className="flex flex-col gap-2 border-t-2 p-4" style={{ borderTopColor: AGENT_COLORS.claim.hex }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-100">{c.claim_number}</span>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  {c.customer_username} â†’ {c.vendor_username}
                </div>
                <p className="text-sm text-slate-300">
                  {c.damage_type} Â· {c.sku} Â· Ã—{c.damaged_qty}
                </p>
                <p className="text-xs text-slate-400">{c.claim_text}</p>
                {c.decision_reason && (
                  <p className="text-xs text-rose-300">{t("detail.justification")}: {c.decision_reason}</p>
                )}
                {c.created_at && (
                  <p className="text-[11px] font-mono text-slate-500">{new Date(c.created_at).toLocaleString()}</p>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

