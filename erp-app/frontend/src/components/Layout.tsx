import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useAlerts } from "../lib/alerts";
import ChatWidget from "./ChatWidget";
import ThemeToggle from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  customer: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/chatbot", label: "Assistant", icon: "💬" },
    { to: "/orders", label: "My Orders", icon: "📦" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
  ],
  admin: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/chatbot", label: "Assistant", icon: "💬" },
    { to: "/customer-order-requests", label: "Customer Orders", icon: "📥" },
    { to: "/purchase-orders", label: "My Orders (POs)", icon: "🧾" },
    { to: "/vendor-inventory", label: "Inventory", icon: "📦" },
    { to: "/vendors", label: "My Vendors", icon: "🏭" },
    { to: "/sla-upload", label: "Upload SLA", icon: "📄" },
    { to: "/sla", label: "SLA Documents", icon: "📋" },
    { to: "/claims", label: "Claim Requests", icon: "⚠️" },
    { to: "/users", label: "Users", icon: "👤" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
    { to: "/audit-logs", label: "Audit Logs", icon: "🕒" },
    { to: "/rag-evaluation", label: "RAG Evaluation", icon: "🧪" },
  ],
  procurement_officer: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/customer-order-requests", label: "Customer Orders", icon: "📥" },
    { to: "/purchase-orders", label: "My Orders (POs)", icon: "🧾" },
    { to: "/sla-upload", label: "Upload SLA", icon: "📄" },
    { to: "/sla", label: "SLA Documents", icon: "📋" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
  ],
  inventory_controller: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/delivered-orders", label: "Delivered Orders", icon: "📬" },
    { to: "/vendor-inventory", label: "Inventory", icon: "📦" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
  ],
  finance_officer: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/sla", label: "SLA Documents", icon: "📋" },
    { to: "/claims", label: "Claim Requests", icon: "⚠️" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  procurement_officer: "Procurement Officer",
  inventory_controller: "Inventory Controller",
  finance_officer: "Finance Officer",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount } = useAlerts();
  const navItems = user ? (NAV_BY_ROLE[user.role] ?? []) : [];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-navy-950">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-navy-900 text-slate-200 dark:bg-navy-950 dark:border-r dark:border-navy-800">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dark text-lg font-bold text-white shadow-lg shadow-accent/30">
            F
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Freight ERP</p>
            <p className="text-[11px] text-slate-400">System of Record</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const showBadge = item.to === "/alerts" && unreadCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-accent text-white shadow-md shadow-accent/20"
                      : "text-slate-300 hover:bg-navy-700/70 hover:text-white hover:translate-x-0.5"
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm shadow-rose-500/40 animate-pulse">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-navy-700 p-4 text-xs text-slate-500">
          Freight ERP v2.0
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm dark:border-navy-800 dark:bg-navy-900 dark:shadow-none">
          <div />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-700">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-sm font-semibold text-white">
                {user?.display_name?.charAt(0) ?? "?"}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
                  {user?.display_name}
                </p>
                <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                  {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
                </p>
              </div>
            </div>
            <ThemeToggle />
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
