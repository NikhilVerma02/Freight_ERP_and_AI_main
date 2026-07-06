import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAlerts } from "../lib/alerts";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { Alert } from "../lib/types";

function typeTone(t: string) {
  if (t.startsWith("new_")) return "blue" as const;
  return "purple" as const;
}

export default function Alerts() {
  const { show } = useToast();
  const { refresh: refreshBadge } = useAlerts();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Alert[]>("/api/alerts");
      setAlerts(
        [...data].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      );
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    refreshBadge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(alert: Alert) {
    try {
      await api.put(`/api/alerts/${alert.id}/read`);
      load();
      refreshBadge();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to mark read");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Alerts</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Notifications for orders and claims involving you.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-slate-400">No alerts.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch"
        >
          {alerts.map((a) => {
            const unread = a.status === "unread";
            return (
              <motion.div key={a.id} variants={fadeUpItem} className="h-full">
                <Card
                  hoverable
                  className={`h-full flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.alerts.bar} ${
                    unread ? "ring-2 ring-amber-400/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{a.title}</span>
                    <Badge tone={typeTone(a.type)} dot>
                      {unread ? "unread" : "read"}
                    </Badge>
                  </div>
                  <p className="flex-1 text-sm text-slate-600 dark:text-slate-300">{a.message}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    {a.created_at && (
                      <p className="text-[11px] text-slate-400">{new Date(a.created_at).toLocaleString()}</p>
                    )}
                    {unread && (
                      <Button size="sm" variant="secondary" className="self-start shrink-0" onClick={() => markRead(a)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
