import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Modal";
import { AskSlaBox } from "../components/AskSlaBox";
import type { VendorSla } from "../lib/types";

export default function SlaView() {
  const { user } = useAuth();
  const { show } = useToast();
  const [slas, setSlas] = useState<VendorSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canDelete = ["admin", "procurement_officer"].includes(user?.role ?? "");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<VendorSla[]>("/api/vendors/sla");
        setSlas(data);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load SLAs");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  async function deleteSla(id: number) {
    setDeletingId(id);
    try {
      await api.delete(`/api/vendors/sla/${id}`);
      show("success", "SLA deleted");
      setSlas((prev) => prev.filter((s) => s.id !== id));
      setConfirmId(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete SLA");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Vendor SLAs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Liability summaries for vendors you work with.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : slas.length === 0 ? (
        <p className="text-sm text-slate-400">No SLAs available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {slas.map((s) => (
            <Card key={s.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {(s as any).vendor_company_name || s.vendor_username}
                  </p>
                  {s.uploaded_at && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(s.uploaded_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {canDelete && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmId(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? "Deleting…" : "Delete"}
                  </Button>
                )}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Liability summary
              </p>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed overflow-auto max-h-80">
                {s.sla_text_cache || s.liability_summary}
              </pre>
              <AskSlaBox slaId={s.id} />
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId !== null && deleteSla(confirmId)}
        message="Delete this SLA document? It will be removed and customers will no longer be able to view or ask about it."
      />
    </div>
  );
}
