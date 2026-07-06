/** Semantic color system — each entity type gets a fixed identity across
 * the whole app (stat tiles, card accents, chart series) instead of
 * everything sharing the one default "accent" blue. Status colors (green
 * /amber/red) are kept separate — see Badge.tsx tones for those. */
export type EntityKind = "orders" | "claims" | "alerts" | "vendors" | "customers" | "inventory" | "sla" | "evaluation";

interface EntityPalette {
  text: string;
  iconBg: string;
  ring: string;
  bar: string; // border-l accent bar shown on list cards
  hex: string; // for recharts series fill/stroke
  surface: string; // pastel full-card background, used by dashboard KPI tiles
}

export const ENTITY_COLORS: Record<EntityKind, EntityPalette> = {
  orders: {
    text: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/10 text-blue-500",
    ring: "ring-blue-500/20",
    bar: "border-l-blue-500",
    hex: "#3b82f6",
    surface: "bg-blue-50 dark:bg-blue-500/10",
  },
  claims: {
    text: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/10 text-violet-500",
    ring: "ring-violet-500/20",
    bar: "border-l-violet-500",
    hex: "#8b5cf6",
    surface: "bg-violet-50 dark:bg-violet-500/10",
  },
  alerts: {
    text: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10 text-amber-500",
    ring: "ring-amber-500/20",
    bar: "border-l-amber-500",
    hex: "#f59e0b",
    surface: "bg-amber-50 dark:bg-amber-500/10",
  },
  vendors: {
    text: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-500/10 text-teal-500",
    ring: "ring-teal-500/20",
    bar: "border-l-teal-500",
    hex: "#14b8a6",
    surface: "bg-teal-50 dark:bg-teal-500/10",
  },
  customers: {
    text: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10 text-indigo-500",
    ring: "ring-indigo-500/20",
    bar: "border-l-indigo-500",
    hex: "#6366f1",
    surface: "bg-indigo-50 dark:bg-indigo-500/10",
  },
  inventory: {
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10 text-emerald-500",
    ring: "ring-emerald-500/20",
    bar: "border-l-emerald-500",
    hex: "#10b981",
    surface: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  sla: {
    text: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-500/10 text-rose-500",
    ring: "ring-rose-500/20",
    bar: "border-l-rose-500",
    hex: "#f43f5e",
    surface: "bg-rose-50 dark:bg-rose-500/10",
  },
  evaluation: {
    text: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-500/10 text-cyan-500",
    ring: "ring-cyan-500/20",
    bar: "border-l-cyan-500",
    hex: "#06b6d4",
    surface: "bg-cyan-50 dark:bg-cyan-500/10",
  },
};

export const STATUS_HEX: Record<string, string> = {
  requested: "#3b82f6",
  delivered: "#10b981",
  undelivered: "#ef4444",
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
};
