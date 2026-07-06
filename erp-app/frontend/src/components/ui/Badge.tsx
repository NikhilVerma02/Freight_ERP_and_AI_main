import React from "react";

type Tone = "slate" | "green" | "yellow" | "red" | "blue" | "purple";

const toneClasses: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700",
  yellow: "bg-amber-50 text-amber-700 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700",
  red: "bg-red-50 text-red-700 ring-red-300 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-700",
  blue: "bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-700",
  purple: "bg-purple-50 text-purple-700 ring-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-700",
};

const dotClasses: Record<Tone, string> = {
  slate: "bg-slate-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export function Badge({
  children,
  tone = "slate",
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (["approved", "resolved", "received", "closed", "ack"].includes(s))
    return "green";
  if (["submitted", "open"].includes(s)) return "blue";
  if (["draft"].includes(s)) return "slate";
  if (["critical", "high"].includes(s)) return "red";
  if (["medium"].includes(s)) return "yellow";
  if (["low"].includes(s)) return "purple";
  return "slate";
}
