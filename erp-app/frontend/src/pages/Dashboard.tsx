import React, { useEffect, useId, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ENTITY_COLORS, EntityKind, STATUS_HEX } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type {
  Order,
  Claim,
  Alert,
  User,
  VendorInventoryItem,
} from "../lib/types";

// ---------------------------------------------------------------------------
// Date/aggregation helpers — every number on this dashboard comes from real
// fetched records (orders/claims/users timestamps), nothing is fabricated.
// ---------------------------------------------------------------------------

function toDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Week-over-week count + % change, used for the trend chip on KPI cards. */
function weekTrend(dates: (string | undefined)[]): { current: number; pct: number | null } {
  const now = new Date();
  const sevenAgo = new Date(now);
  sevenAgo.setDate(now.getDate() - 7);
  const fourteenAgo = new Date(now);
  fourteenAgo.setDate(now.getDate() - 14);

  let current = 0;
  let previous = 0;
  for (const ds of dates) {
    const d = toDate(ds);
    if (!d) continue;
    if (d >= sevenAgo && d <= now) current++;
    else if (d >= fourteenAgo && d < sevenAgo) previous++;
  }
  const pct = previous === 0 ? (current > 0 ? 100 : null) : Math.round(((current - previous) / previous) * 100);
  return { current, pct };
}

function isThisMonth(d: Date, now: Date): boolean {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function isToday(d: Date, now: Date): boolean {
  return isThisMonth(d, now) && d.getDate() === now.getDate();
}

/** Last N months' counts, bucketed for two series at once (e.g. orders vs claims). */
function monthlySeries(
  datesA: (string | undefined)[],
  datesB: (string | undefined)[],
  keyA: string,
  keyB: string,
  months = 6
): Record<string, string | number>[] {
  const now = new Date();
  const order: string[] = [];
  const buckets: Record<string, Record<string, string | number>> = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets[key] = { name: d.toLocaleString("en-US", { month: "short" }), [keyA]: 0, [keyB]: 0 };
    order.push(key);
  }
  function fill(dates: (string | undefined)[], field: string) {
    for (const ds of dates) {
      const d = toDate(ds);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (buckets[key]) buckets[key][field] = (buckets[key][field] as number) + 1;
    }
  }
  fill(datesA, keyA);
  fill(datesB, keyB);
  return order.map((k) => buckets[k]);
}

/** Daily counts for the last N days, for sparklines. */
function dailySeries(dates: (string | undefined)[], days = 14): { name: string; value: number }[] {
  const now = new Date();
  const order: string[] = [];
  const buckets: Record<string, { name: string; value: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toDateString();
    buckets[key] = { name: d.toLocaleString("en-US", { month: "short", day: "numeric" }), value: 0 };
    order.push(key);
  }
  for (const ds of dates) {
    const d = toDate(ds);
    if (!d) continue;
    const key = d.toDateString();
    if (buckets[key]) buckets[key].value += 1;
  }
  return order.map((k) => buckets[k]);
}

function breakdown(items: { status: string }[], colorMap: Record<string, string> = STATUS_HEX) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, value]) => ({
    name,
    value,
    color: colorMap[name] || "#94a3b8",
  }));
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </motion.div>
  );
}

function TrendChip({ pct, dark = false }: { pct: number | null; dark?: boolean }) {
  if (pct === null) {
    return <span className={`text-[11px] font-medium ${dark ? "text-slate-400" : "text-slate-400 dark:text-slate-500"}`}>No prior data</span>;
  }
  const up = pct >= 0;
  const trendColor = up ? (dark ? "text-emerald-400" : "text-emerald-600 dark:text-emerald-400") : dark ? "text-red-400" : "text-red-600 dark:text-red-400";
  const mutedColor = dark ? "text-slate-400" : "text-slate-400 dark:text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${trendColor}`}>
      {up ? "↗" : "↘"} {Math.abs(pct)}% <span className={`font-normal ${mutedColor}`}>vs last week</span>
    </span>
  );
}

/** First KPI card in the row — permanently dark surface, matching the "hero" tile look. */
const GRADIENT_PALETTES = [
  { gradient: "from-blue-500 to-blue-700",       shadow: "shadow-blue-500/40"   },
  { gradient: "from-emerald-400 to-teal-600",    shadow: "shadow-emerald-500/40" },
  { gradient: "from-amber-400 to-orange-500",    shadow: "shadow-amber-400/40"  },
  { gradient: "from-pink-500 to-rose-600",       shadow: "shadow-pink-500/40"   },
];

function GradientKpiCard({
  label, value, icon, pct, sublabel, subvalue, paletteIndex = 0,
}: {
  label: string; value: React.ReactNode; icon: string; pct: number | null;
  sublabel?: string; subvalue?: React.ReactNode; paletteIndex?: number;
}) {
  const p = GRADIENT_PALETTES[paletteIndex % GRADIENT_PALETTES.length];
  return (
    <motion.div variants={fadeUpItem}>
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${p.gradient} p-5 text-white shadow-lg ${p.shadow} transition-transform duration-200 hover:-translate-y-1`}>
        {/* decorative circle */}
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-2 h-16 w-16 rounded-full bg-white/10" />

        <div className="relative flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl backdrop-blur-sm">
            {icon}
          </div>
        </div>

        <p className="relative mt-4 text-4xl font-extrabold tracking-tight">{value}</p>
        <p className="relative mt-1 text-sm font-semibold uppercase tracking-wider text-white/80">{label}</p>

        {(sublabel || subvalue) && (
          <div className="relative mt-3 flex items-center justify-between border-t border-white/20 pt-3">
            <span className="text-xs text-white/70">{sublabel}</span>
            <span className="text-xs font-bold">{subvalue}</span>
          </div>
        )}
        {!sublabel && (
          <div className="relative mt-3 border-t border-white/20 pt-3">
            <TrendChip pct={pct} dark />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function HeroKpiCard({ label, value, icon, kind, pct }: { label: string; value: React.ReactNode; icon: string; kind: EntityKind; pct: number | null }) {
  const palette = ENTITY_COLORS[kind];
  return (
    <motion.div variants={fadeUpItem}>
      <div className="overflow-hidden rounded-xl bg-navy-900 p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5 dark:bg-black dark:shadow-none">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{ backgroundColor: `${palette.hex}30`, color: palette.hex }}
        >
          {icon}
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-3xl font-bold text-white">{value}</p>
        <div className="mt-2">
          <TrendChip pct={pct} dark />
        </div>
      </div>
    </motion.div>
  );
}

/** Pastel-surface KPI card for the rest of the top row. */
function TintKpiCard({
  label,
  value,
  icon,
  kind,
  pct,
  urgent = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  kind: EntityKind;
  pct: number | null;
  urgent?: boolean;
}) {
  const palette = urgent
    ? { ...ENTITY_COLORS.alerts, surface: "bg-red-50 dark:bg-red-500/10", iconBg: "bg-red-500/10 text-red-500", text: "text-red-600 dark:text-red-400" }
    : ENTITY_COLORS[kind];
  return (
    <motion.div variants={fadeUpItem}>
      <div
        className={`overflow-hidden rounded-xl border border-slate-200/60 p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5 dark:border-navy-700 dark:shadow-none ${palette.surface}`}
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${palette.iconBg}`}>{icon}</div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${palette.text}`}>{value}</p>
        <div className="mt-2">
          <TrendChip pct={pct} />
        </div>
      </div>
    </motion.div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {children}
    </motion.div>
  );
}

function ChartLegendDot({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
      {label}
    </span>
  );
}

function AreaTrendCard({
  title,
  data,
  seriesA,
  seriesB,
}: {
  title: string;
  data: Record<string, string | number>[];
  seriesA: { key: string; label: string; hex: string };
  seriesB: { key: string; label: string; hex: string };
}) {
  const gradA = useId();
  const gradB = useId();
  return (
    <motion.div variants={fadeUpItem}>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
          <div className="flex items-center gap-3">
            <ChartLegendDot hex={seriesA.hex} label={seriesA.label} />
            <ChartLegendDot hex={seriesB.hex} label={seriesB.label} />
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradA} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={seriesA.hex} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={seriesA.hex} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={gradB} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={seriesB.hex} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={seriesB.hex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey={seriesA.key} name={seriesA.label} stroke={seriesA.hex} strokeWidth={2} fill={`url(#${gradA})`} />
              <Area type="monotone" dataKey={seriesB.key} name={seriesB.label} stroke={seriesB.hex} strokeWidth={2} fill={`url(#${gradB})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

function DonutCompletionCard({
  title,
  data,
  centerLabel,
  centerSublabel = "Total",
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
  centerLabel: string;
  centerSublabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <motion.div variants={fadeUpItem}>
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {total === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">No data yet</div>
        ) : (
          <>
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{centerLabel}</span>
                <span className="text-[11px] text-slate-400">{centerSublabel}</span>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {data.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-semibold" style={{ color: d.color }}>
                    {Math.round((d.value / total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}

function MiniTrendCard({
  title,
  total,
  thisMonth,
  today,
  sparkline,
  hex,
}: {
  title: string;
  total: number;
  thisMonth: number;
  today: number;
  sparkline: { name: string; value: number }[];
  hex: string;
}) {
  return (
    <motion.div variants={fadeUpItem} className="h-full">
      <Card className="p-4 h-full flex flex-col">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        <div className="mb-3 flex divide-x divide-slate-200 text-center dark:divide-navy-700">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{total}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">This Month</p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{thisMonth}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Today</p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{today}</p>
          </div>
        </div>
        <div className="flex-1 min-h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <XAxis dataKey="name" hide />
              <YAxis hide allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke={hex} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

function GroupedBarCard({
  title,
  data,
  seriesA,
  seriesB,
}: {
  title: string;
  data: Record<string, string | number>[];
  seriesA: { key: string; label: string; hex: string };
  seriesB: { key: string; label: string; hex: string };
}) {
  return (
    <motion.div variants={fadeUpItem} className="h-full">
      <Card className="p-4 h-full flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
          <div className="flex items-center gap-3">
            <ChartLegendDot hex={seriesA.hex} label={seriesA.label} />
            <ChartLegendDot hex={seriesB.hex} label={seriesB.label} />
          </div>
        </div>
        <div className="flex-1 min-h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey={seriesA.key} name={seriesA.label} fill={seriesA.hex} radius={[4, 4, 0, 0]} />
              <Bar dataKey={seriesB.key} name={seriesB.label} fill={seriesB.hex} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}

function SingleBarCard({ title, data, kind }: { title: string; data: { name: string; value: number; color: string }[]; kind: EntityKind }) {
  return (
    <motion.div variants={fadeUpItem}>
      <Card className={`border-l-4 ${ENTITY_COLORS[kind].bar} p-4`}>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        <div className="h-56">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard root — picks the role-specific view
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "admin" || user.role === "procurement_officer") return <AdminDashboard />;
  if (user.role === "inventory_controller") return <InventoryDashboard />;
  if (user.role === "finance_officer") return <FinanceDashboard />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, u] = await Promise.all([
          api.get<Order[]>("/api/orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<User[]>("/api/users"),
        ]);
        setOrders(o);
        setClaims(c);
        setUsers(u);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      }
    })();
  }, [show]);

  const ERP_OFFICER_ROLES = new Set(["admin", "warehouse", "procurement_officer", "inventory_controller", "finance_officer"]);
  const vendors = users.filter((u) => u.role === "vendor" || u.role === "vendor_order_manager");
  const officers = users.filter((u) => ERP_OFFICER_ROLES.has(u.role));
  const orderDates = orders.map((o) => o.requested_at || o.created_at);
  const claimDates = claims.map((c) => c.created_at);
  const orderTrend = weekTrend(orderDates);
  const claimTrend = weekTrend(claimDates);

  const now = new Date();
  const claimTotal = claims.length;
  const claimThisMonth = claims.filter((c) => {
    const d = toDate(c.created_at);
    return d && isThisMonth(d, now);
  }).length;
  const claimToday = claims.filter((c) => {
    const d = toDate(c.created_at);
    return d && isToday(d, now);
  }).length;

  const orderStatusData = breakdown(orders);
  const deliveredPct = orders.length ? Math.round((orders.filter((o) => o.status === "delivered").length / orders.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" subtitle="Platform-wide overview." />

      <KpiRow>
        <GradientKpiCard label="Total Orders" value={orders.length} icon="🧾" pct={orderTrend.pct} sublabel="vs last week" subvalue={<TrendChip pct={orderTrend.pct} dark />} paletteIndex={0} />
        <GradientKpiCard label="Total Claims" value={claims.length} icon="📋" pct={claimTrend.pct} sublabel="vs last week" subvalue={<TrendChip pct={claimTrend.pct} dark />} paletteIndex={1} />
        <GradientKpiCard label="Vendors" value={vendors.length} icon="🏭" pct={null} sublabel="Active vendors" subvalue={vendors.length} paletteIndex={2} />
        <GradientKpiCard label="ERP Users" value={officers.length} icon="👤" pct={null} sublabel="Internal officers" subvalue={officers.length} paletteIndex={3} />
      </KpiRow>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AreaTrendCard
            title="Orders Overview"
            data={monthlySeries(orderDates, claimDates, "orders", "claims")}
            seriesA={{ key: "orders", label: "Orders", hex: ENTITY_COLORS.orders.hex }}
            seriesB={{ key: "claims", label: "Claims", hex: ENTITY_COLORS.claims.hex }}
          />
        </div>
        <DonutCompletionCard title="Order Status Breakdown" data={orderStatusData} centerLabel={`${deliveredPct}%`} centerSublabel="Delivered" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
        <div className="flex flex-col">
          <MiniTrendCard
            title="Claims"
            total={claimTotal}
            thisMonth={claimThisMonth}
            today={claimToday}
            sparkline={dailySeries(claimDates)}
            hex={ENTITY_COLORS.claims.hex}
          />
        </div>
        <div className="flex flex-col">
          <GroupedBarCard
            title="New Vendors vs ERP Users by Month"
            data={monthlySeries(vendors.map((v) => v.created_at), officers.map((o) => o.created_at), "vendors", "users")}
            seriesA={{ key: "vendors", label: "Vendors", hex: ENTITY_COLORS.vendors.hex }}
            seriesB={{ key: "users", label: "ERP Users", hex: ENTITY_COLORS.customers.hex }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory Controller Dashboard
// ---------------------------------------------------------------------------
function InventoryDashboard() {
  const { show } = useToast();
  const [inv, setInv] = useState<VendorInventoryItem[]>([]);
  useEffect(() => {
    api.get<VendorInventoryItem[]>("/api/vendor_inventory").then(setInv).catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load inventory"));
  }, [show]);
  const low = inv.filter((i) => i.qty_on_hand <= i.reorder_threshold);
  const critical = inv.filter((i) => i.manufacturing_critical);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Inventory Dashboard" subtitle="Monitor stock levels and reorder points." />
      <KpiRow>
        <GradientKpiCard label="Total SKUs" value={inv.length} icon="📦" pct={null} sublabel="Tracked items" subvalue={inv.length} paletteIndex={0} />
        <GradientKpiCard label="Low Stock" value={low.length} icon="⚠️" pct={null} sublabel="Below threshold" subvalue={low.length} paletteIndex={3} />
        <GradientKpiCard label="Critical Items" value={critical.length} icon="🔴" pct={null} sublabel="Manufacturing critical" subvalue={critical.length} paletteIndex={2} />
        <GradientKpiCard label="Vendors" value={new Set(inv.map((i) => i.vendor_username)).size} icon="🏭" pct={null} sublabel="Active vendors" subvalue={new Set(inv.map((i) => i.vendor_username)).size} paletteIndex={1} />
      </KpiRow>
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Low Stock Items</h3>
        {low.length === 0 ? (
          <p className="text-sm text-slate-400">All items are above reorder threshold.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-slate-200 dark:divide-navy-700">
              <thead><tr>{["Vendor","SKU","Item","On Hand","Reorder At","Critical"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
                {low.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{i.vendor_username}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{i.sku}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{i.item_name}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">{i.qty_on_hand}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{i.reorder_threshold}</td>
                    <td className="px-3 py-2 text-center">{i.manufacturing_critical ? "🔴" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance Officer Dashboard
// ---------------------------------------------------------------------------
function FinanceDashboard() {
  const { show } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  useEffect(() => {
    api.get<Claim[]>("/api/claims").then(setClaims).catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load claims"));
  }, [show]);
  const pending = claims.filter((c) => c.status === "pending");
  const approved = claims.filter((c) => c.status === "approved");
  const rejected = claims.filter((c) => c.status === "rejected");
  const claimDates = claims.map((c) => c.created_at);
  const claimTrend = weekTrend(claimDates);
  const now = new Date();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Finance Dashboard" subtitle="Claims management and SLA compliance overview." />
      <KpiRow>
        <GradientKpiCard label="Total Claims" value={claims.length} icon="📋" pct={claimTrend.pct} sublabel="vs last week" subvalue={<TrendChip pct={claimTrend.pct} dark />} paletteIndex={0} />
        <GradientKpiCard label="Pending" value={pending.length} icon="⏳" pct={null} sublabel="Awaiting decision" subvalue={pending.length} paletteIndex={2} />
        <GradientKpiCard label="Approved" value={approved.length} icon="✅" pct={null} sublabel="Claims approved" subvalue={approved.length} paletteIndex={1} />
        <GradientKpiCard label="Rejected" value={rejected.length} icon="❌" pct={null} sublabel="Claims rejected" subvalue={rejected.length} paletteIndex={3} />
      </KpiRow>
      <DonutCompletionCard
        title="Claims Status Breakdown"
        data={[
          { name: "Pending", value: pending.length, color: "#f59e0b" },
          { name: "Approved", value: approved.length, color: "#10b981" },
          { name: "Rejected", value: rejected.length, color: "#ef4444" },
        ]}
        centerLabel={String(claims.length)}
        centerSublabel="Total Claims"
      />
    </div>
  );
}
