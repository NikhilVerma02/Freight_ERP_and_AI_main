import type { StepKey } from "./agentFacts";

/** Each agent in the pipeline gets its own fixed color identity (icon ring,
 * chart bar fill, etc.) instead of every card sharing the one default
 * cyan accent — makes the 7-step flow visually scannable at a glance. */
interface AgentPalette {
  ring: string;
  iconBg: string;
  hex: string;
}

export const AGENT_COLORS: Record<StepKey, AgentPalette> = {
  inspector: { ring: "border-sky-400/40", iconBg: "bg-sky-500/10", hex: "#38bdf8" },
  context: { ring: "border-indigo-400/40", iconBg: "bg-indigo-500/10", hex: "#818cf8" },
  policy: { ring: "border-violet-400/40", iconBg: "bg-violet-500/10", hex: "#a78bfa" },
  inventory: { ring: "border-emerald-400/40", iconBg: "bg-emerald-500/10", hex: "#34d399" },
  reorder: { ring: "border-amber-400/40", iconBg: "bg-amber-500/10", hex: "#fbbf24" },
  claim: { ring: "border-pink-400/40", iconBg: "bg-pink-500/10", hex: "#f472b6" },
  governance: { ring: "border-cyan-400/40", iconBg: "bg-cyan-500/10", hex: "#22d3ee" },
};

export const STAT_HEX = {
  blue: "#3b82f6",
  violet: "#a78bfa",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#fb7185",
};
