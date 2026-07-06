import React from "react";
import { ENTITY_COLORS, EntityKind } from "../../lib/colors";

export function Card({
  className = "",
  children,
  interactive = false,
  hoverable = false,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  hoverable?: boolean;
}) {
  const isInteractive = interactive || hoverable;
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none ${
        isInteractive
          ? "transition-all duration-200 hover:shadow-xl hover:-translate-y-1 hover:border-accent/60 dark:hover:shadow-2xl dark:hover:shadow-black/40 dark:hover:border-accent/60"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  accent,
  icon,
  iconBg,
  kind,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  /** Auto-derive accent/iconBg from the semantic entity palette (lib/colors.ts) — pass an
   * explicit `accent`/`iconBg` instead if you need a one-off override (e.g. status-driven red). */
  kind?: EntityKind;
}) {
  const palette = kind ? ENTITY_COLORS[kind] : undefined;
  const resolvedAccent = accent ?? palette?.text ?? "text-slate-900 dark:text-slate-100";
  const resolvedIconBg = iconBg ?? palette?.iconBg ?? "bg-accent/10 text-accent";
  return (
    <Card interactive className={`overflow-hidden p-5 ${palette ? `border-l-4 ${palette.bar}` : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${resolvedAccent}`}>{value}</p>
        </div>
        {icon && (
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${resolvedIconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
