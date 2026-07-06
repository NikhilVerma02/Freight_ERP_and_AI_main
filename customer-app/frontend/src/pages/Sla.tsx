import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import type { SlaDoc } from "../lib/types";

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function vendorLabel(doc: SlaDoc & { vendor_company_name?: string }) {
  return doc.vendor_company_name || doc.vendor_username;
}

export default function Sla() {
  const { show } = useToast();
  const [docs, setDocs] = useState<(SlaDoc & { vendor_company_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<(SlaDoc & { vendor_company_name?: string })[]>("/api/sla")
      .then(setDocs)
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load SLA docs"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">SLA Documents</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Service Level Agreements from your linked vendors.</p>
      </div>

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500">Loading…</p>
      ) : docs.length === 0 ? (
        <Card><p className="text-sm text-slate-400 dark:text-slate-500">No SLA documents available yet. Your vendor needs to upload them.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <Card key={doc.id} className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">📋</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{doc.filename}</p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">{vendorLabel(doc)}</p>
                {doc.vendor_company_name && doc.vendor_username !== doc.vendor_company_name && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">@{doc.vendor_username}</p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Uploaded: {fmt(doc.upload_date)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
