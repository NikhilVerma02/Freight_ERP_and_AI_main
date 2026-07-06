import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type { Claim } from "../lib/types";

const STATUS_BADGE: Record<string, "blue" | "yellow" | "green" | "red" | "slate"> = {
  pending: "yellow",
  investigating: "blue",
  approved: "green",
  rejected: "red",
};

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Claims() {
  const { show } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Claim[]>("/api/claims")
      .then(setClaims)
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load claims"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Claims</h1>
        <p className="text-sm text-slate-500 mt-1">Claims you have raised. Go to My Orders → delivered order to raise a new claim.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Claim #", "Vendor", "Status", "Decision", "Amount", "Description", "Created"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : claims.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No claims yet.</td></tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.claim_number ?? String(c.id).slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-700">{c.vendor_company_name || c.vendor_username}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_BADGE[c.status] ?? "slate"}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{c.decision_reason ?? c.decision ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{c.amount ? `₹${Number(c.amount).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{c.claim_text ?? c.description}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(c.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
