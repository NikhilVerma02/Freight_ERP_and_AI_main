import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { Badge, Card, CardBody } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AGENT_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { OrderRequestRecord } from "../lib/types";

function statusTone(status: string): "ok" | "failed" | "running" {
  if (status === "delivered") return "ok";
  if (status === "undelivered") return "failed";
  return "running";
}

export default function OrderRequests() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OrderRequestRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OrderRequestRecord[]>("/api/orders")
      .then((data) =>
        setOrders([...data].sort((a, b) => (b.requested_at || b.created_at || "").localeCompare(a.requested_at || a.created_at || "")))
      )
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold ai-text-primary">{t("orderRequests.title")}</h1>
        <p className="mt-1 text-sm ai-text-secondary">{t("orderRequests.subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
          {error}
        </div>
      )}

      {!orders && !error && <LoadingOverlay label={t("common.loading")} />}

      {orders && orders.length === 0 && (
        <Card>
          <CardBody className="text-center text-sm text-slate-500">{t("orderRequests.empty")}</CardBody>
        </Card>
      )}

      {orders && orders.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {orders.map((o) => (
            <motion.div key={o.id} variants={fadeUpItem}>
              <Card className="flex flex-col gap-2 border-t-2 p-4" style={{ borderTopColor: AGENT_COLORS.reorder.hex }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold ai-text-primary">{o.order_number}</span>
                  <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  {o.customer_username} â†’ {o.vendor_username}
                </div>
                <ul className="space-y-1 text-sm ai-text-primary">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {it.item_name} <span className="text-slate-500">({it.sku})</span>
                      </span>
                      <span className="font-medium">Ã—{it.qty}</span>
                    </li>
                  ))}
                </ul>
                {o.undelivered_reason && (
                  <p className="text-xs text-rose-500 dark:text-rose-300">{t("detail.error")}: {o.undelivered_reason}</p>
                )}
                {(o.requested_at || o.created_at) && (
                  <p className="text-[11px] font-mono text-slate-500">
                    {new Date(o.requested_at || o.created_at!).toLocaleString()}
                  </p>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

