import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import ThemeToggle from "./ThemeToggle";

interface NavItem { to: string; label: string; icon: string; }

const NAV_ORDER_MANAGER: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/purchase-orders", label: "Purchase Orders", icon: "🧾" },
  { to: "/alerts", label: "Alerts", icon: "🚨" },
];

const NAV_CLAIM_HANDLER: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/claims", label: "Claim Requests", icon: "⚠️" },
  { to: "/sla-documents", label: "SLA Documents", icon: "📋" },
  { to: "/alerts", label: "Alerts", icon: "🚨" },
];

const NAV_ADMIN: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/purchase-orders", label: "Purchase Orders", icon: "🧾" },
  { to: "/claims", label: "Claim Requests", icon: "⚠️" },
  { to: "/sla-documents", label: "SLA Documents", icon: "📋" },
  { to: "/users", label: "Users", icon: "👤" },
  { to: "/alerts", label: "Alerts", icon: "🚨" },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  vendor_order_manager: NAV_ORDER_MANAGER,
  vendor_claim_handler: NAV_CLAIM_HANDLER,
  admin: NAV_ADMIN,
};

const ROLE_LABELS: Record<string, string> = {
  vendor_order_manager: "Order Manager",
  vendor_claim_handler: "Claim Handler",
  admin: "Administrator",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navItems = user ? (NAV_BY_ROLE[user.role] ?? []) : [];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-navy-950">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-navy-900 text-slate-200 dark:bg-navy-950 dark:border-r dark:border-navy-800">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dark text-lg font-bold text-white shadow-lg shadow-accent/30">
            V
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Vendor Portal</p>
            <p className="text-[11px] text-slate-400">Freight Platform</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3 overflow-y-auto">
          {navItems.map((item) => (
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
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-navy-700 p-4 text-xs text-slate-500">
          Vendor Portal v1.0
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm dark:border-navy-800 dark:bg-navy-900">
          <div />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-700">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-sm font-semibold text-white">
                {user?.display_name?.charAt(0) ?? "?"}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
                  {user?.company_name || user?.display_name}
                </p>
                <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                  {user ? (ROLE_LABELS[user.role] ?? user.role) : ""}
                  {user?.company_name && user?.display_name ? ` · ${user.display_name}` : ""}
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
    </div>
  );
}
