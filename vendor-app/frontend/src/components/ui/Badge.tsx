import React from "react";

type Tone = "blue" | "green" | "yellow" | "red" | "slate" | "emerald" | "purple";

const TONE: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  yellow: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({ tone = "slate", dot, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
