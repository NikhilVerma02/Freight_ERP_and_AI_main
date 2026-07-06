import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import ThemeToggle from "../components/ThemeToggle";

type ErpRole =
  | "admin"
  | "procurement_officer"
  | "inventory_controller"
  | "finance_officer";

const ERP_ROLES: ErpRole[] = [
  "admin",
  "procurement_officer",
  "inventory_controller",
  "finance_officer",
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  procurement_officer: "Procurement Officer",
  inventory_controller: "Inventory Controller",
  finance_officer: "Finance Officer",
};

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function FreightIllustration() {
  return (
    <svg
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMax slice"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f2040" />
        </linearGradient>
        <linearGradient id="bld" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#sky)" />
      <circle cx="300" cy="100" r="50" fill="#3b82f6" opacity="0.15" />
      <circle cx="80" cy="70" r="35" fill="#60a5fa" opacity="0.12" />
      <g fill="url(#bld)">
        <rect x="20" y="360" width="50" height="240" />
        <rect x="80" y="300" width="40" height="300" />
        <rect x="130" y="400" width="55" height="200" />
        <rect x="195" y="260" width="45" height="340" />
        <rect x="250" y="340" width="60" height="260" />
        <rect x="320" y="380" width="50" height="220" />
      </g>
      <g fill="#bfdbfe" opacity="0.4">
        {Array.from({ length: 24 }).map((_, i) => (
          <rect
            key={i}
            x={28 + (i % 6) * 56}
            y={280 + Math.floor(i / 6) * 30}
            width="8"
            height="10"
          />
        ))}
      </g>
      <text
        x="200"
        y="200"
        textAnchor="middle"
        fill="#93c5fd"
        fontSize="14"
        opacity="0.6"
        fontFamily="sans-serif"
      >
        Freight ERP System of Record
      </text>
    </svg>
  );
}

export default function Login() {
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState<ErpRole>("admin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ description: string }>("/api/auth/password-policy")
      .then((res) => setPasswordPolicy(res.description))
      .catch(() => {});
  }, []);

  if (user) {
    const dest = (location.state as { from?: string } | null)?.from || "/";
    navigate(dest, { replace: true });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(username.trim().toLowerCase(), password);
      if (!ERP_ROLES.includes(loggedInUser.role as ErpRole)) {
        logout();
        setError(
          `This account has role '${loggedInUser.role}'. Please use the Vendor Portal or Customer Portal to log in.`,
        );
        return;
      }
      if (loggedInUser.role !== loginRole) {
        logout();
        setError(
          `This account is registered as ${ROLE_LABELS[loggedInUser.role] ?? loggedInUser.role}, not ${ROLE_LABELS[loginRole]}. Please select the correct role.`,
        );
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white px-4 py-10 dark:from-navy-950 dark:via-navy-900 dark:to-black">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-navy-800 dark:ring-white/10">
        {/* Left: form panel */}
        <div className="flex w-full flex-col gap-5 p-8 sm:p-10 md:w-[55%]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dark text-lg font-bold text-white shadow-lg shadow-accent/30">
            F
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              ERP Portal Sign In
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              For ERP staff: Admin, Procurement Officer, Inventory Controller,
              Finance Officer.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <Select
              id="si-role"
              label="I am a..."
              value={loginRole}
              onChange={(e) => setLoginRole(e.target.value as ErpRole)}
            >
              {ERP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <Input
              id="username"
              icon={<UserIcon />}
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              id="password"
              icon={<LockIcon />}
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-navy-900 dark:text-slate-400 dark:ring-navy-700 space-y-1">
            <p className="font-semibold text-slate-600 dark:text-slate-300">
              Demo credentials all passwords:{" "}
              <span className="font-mono">Admin@123</span>
            </p>
            <p>
              <span className="font-mono text-slate-700 dark:text-slate-200">
                admin
              </span>{" "}
              Administrator
            </p>
            <p>
              <span className="font-mono text-slate-700 dark:text-slate-200">
                proc_officer
              </span>{" "}
              Procurement Officer
            </p>
            <p>
              <span className="font-mono text-slate-700 dark:text-slate-200">
                inv_controller
              </span>{" "}
              Inventory Controller
            </p>
            <p>
              <span className="font-mono text-slate-700 dark:text-slate-200">
                fin_officer
              </span>{" "}
              Finance Officer
            </p>
          </div>
        </div>

        {/* Right: illustration panel */}
        <div className="relative hidden w-[45%] md:block">
          <FreightIllustration />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950/30 via-transparent to-transparent" />
        </div>
      </div>
    </div>
  );
}
