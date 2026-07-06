import React from "react";

type Tone = "ok" | "failed" | "running" | "partial" | "neutral" | "info" | "skipped";

const toneClasses: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  running: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  neutral: "bg-slate-700/30 text-slate-300 border-slate-600/40",
  info: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  skipped: "bg-slate-600/20 text-slate-400 border-slate-500/30",
};

export function statusToTone(status: string | null | undefined): Tone {
  switch (status) {
    case "ok":
    case "completed":
      return "ok";
    case "failed":
    case "po_mismatch":
      return "failed";
    case "running":
      return "running";
    case "partial":
      return "partial";
    case "skipped":
      return "skipped";
    default:
      return "neutral";
  }
}

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
