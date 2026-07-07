import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Role, useAuth } from "../lib/auth";
import { getLanguage, setLanguage } from "../lib/i18n";
import ThemeToggle from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

/* ── Nav icons (SVG, always crisp at any size) ── */
function IconIntake()     { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function IconHistory()    { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>; }
function IconClaim()      { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>; }
function IconOrder()      { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>; }
function IconBot()        { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function IconKpi()        { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconLogs()       { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function IconUsers()      { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }

const NAV_ITEMS: NavItem[] = [
  { to: "/intake",     label: "Case Intake",      icon: <IconIntake />,  roles: ["admin", "inspector"] },
  { to: "/history",    label: "Case History",     icon: <IconHistory />, roles: ["admin", "inspector"] },
  { to: "/claims",     label: "Claim Request",    icon: <IconClaim />,   roles: ["admin", "inspector"] },
  { to: "/orders",     label: "Order Request",    icon: <IconOrder />,   roles: ["admin", "inspector"] },
  { to: "/kpi",        label: "KPI Dashboard",    icon: <IconKpi />,     roles: ["admin"] },
  { to: "/logs",       label: "Logs & Exceptions",icon: <IconLogs />,    roles: ["admin"] },
  { to: "/inspectors", label: "Inspectors",       icon: <IconUsers />,   roles: ["admin"] },
];

const ROLE_LABELS: Record<string, string> = {
  admin:     "Administrator",
  inspector: "Inspector",
};

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const [lang, setLang] = React.useState(getLanguage());
  const visibleItems = NAV_ITEMS.filter((item) => hasRole(...item.roles));

  function toggleLang() {
    const next = lang === "en" ? "hi" : "en";
    setLanguage(next);
    setLang(next);
  }

  return (
    <div className="flex h-screen overflow-hidden ai-page">
      {/* ── Sidebar — always dark (ops console identity) ── */}
      <aside className="flex w-60 flex-shrink-0 flex-col ai-sidebar">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/20 border border-accent-500/30 text-accent-400 font-bold text-sm shadow-sm">
            ⌬
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Freight AI</p>
            <p className="text-[9px] font-mono uppercase tracking-widest text-accent-400/60 mt-0.5">Agentic Ops Console</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-2 py-3 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/intake"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-4 py-3 text-[10px] font-mono text-slate-600">
          Freight AI v1.0
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="ai-header relative z-[150] flex items-center justify-between px-6 py-2.5">
          <div />
          <div className="flex items-center gap-2">
            {/* User chip */}
            <div className="flex items-center gap-2.5 rounded-full bg-slate-100 dark:bg-slate-800/70 px-3 py-1.5 ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500/20 border border-accent-500/30 text-[10px] font-bold text-accent-500 dark:text-accent-300">
                {user?.display_name?.charAt(0) ?? "?"}
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight ai-text-primary">{user?.display_name}</p>
                <p className="text-[10px] leading-tight text-accent-500 dark:text-accent-400">{user ? (ROLE_LABELS[user.role] ?? user.role) : ""}</p>
              </div>
            </div>

            {/* Lang toggle */}
            <button
              onClick={toggleLang}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide ai-text-secondary hover:border-accent-500 hover:text-accent-500 dark:hover:border-accent-400 dark:hover:text-accent-400 transition-colors"
            >
              {lang === "en" ? "EN / हिं" : "हिं / EN"}
            </button>

            <ThemeToggle />

            {/* Logout */}
            <button
              onClick={logout}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium ai-text-secondary hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 ai-text-primary scanline-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
