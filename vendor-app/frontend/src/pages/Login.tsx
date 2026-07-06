import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import ThemeToggle from "../components/ThemeToggle";

type VendorRole = "vendor_order_manager" | "vendor_claim_handler" | "admin";
const VENDOR_ROLES: VendorRole[] = ["vendor_order_manager", "vendor_claim_handler"];

export default function Login() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(username.trim().toLowerCase(), password);
      if (loggedIn.role !== "admin" && !VENDOR_ROLES.includes(loggedIn.role as VendorRole)) {
        logout();
        setError(`This account has role '${loggedIn.role}'. Please use the ERP Portal or Customer Portal.`);
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-green-50 to-white px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10 dark:shadow-black/40">
        {/* Left panel */}
        <div className="flex w-full flex-col gap-5 p-8 sm:p-10 md:w-[55%]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/30">
            V
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Vendor Portal</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">For Order Managers and Claim Handlers.</p>
          </div>

          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <input className={inputCls} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input type="password" className={inputCls} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-800/50">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-500 transition-colors disabled:opacity-60">
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 space-y-1 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">Demo credentials &mdash; password: <span className="font-mono text-emerald-600 dark:text-emerald-400">Admin@123</span></p>
            <p><span className="font-mono text-slate-700 dark:text-slate-200">vendor_mgr</span> &nbsp;Vendor Order Manager</p>
            <p><span className="font-mono text-slate-700 dark:text-slate-200">vendor_claims</span> &nbsp;Vendor Claim Handler</p>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Not a vendor?{" "}
            <a href="http://localhost:5173" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">ERP Portal &rarr;</a>
            {"  "}
            <a href="http://localhost:5176" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Customer Portal &rarr;</a>
          </p>
        </div>

        {/* Right illustration */}
        <div className="relative hidden w-[45%] md:block">
          <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
            <defs>
              <linearGradient id="vpBg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#064e3b" />
                <stop offset="100%" stopColor="#022c22" />
              </linearGradient>
            </defs>
            <rect width="400" height="600" fill="url(#vpBg)" />
            <circle cx="200" cy="220" r="130" fill="#10b981" opacity="0.10" />
            <circle cx="200" cy="220" r="90" fill="#10b981" opacity="0.08" />
            <g transform="translate(80, 160)">
              <rect x="0" y="20" width="150" height="80" rx="8" fill="#065f46" stroke="#10b981" strokeWidth="1.5"/>
              <polygon points="150,20 150,100 230,100 230,52 205,20" fill="#047857" stroke="#10b981" strokeWidth="1.5"/>
              <polygon points="155,26 155,60 225,60 225,52 205,26" fill="#064e3b" stroke="#34d399" strokeWidth="1" opacity="0.8"/>
              <rect x="0" y="55" width="150" height="8" fill="#059669" opacity="0.5"/>
              <circle cx="45" cy="104" r="18" fill="#022c22" stroke="#10b981" strokeWidth="2.5"/>
              <circle cx="45" cy="104" r="8" fill="#065f46" stroke="#34d399" strokeWidth="1.5"/>
              <circle cx="185" cy="104" r="18" fill="#022c22" stroke="#10b981" strokeWidth="2.5"/>
              <circle cx="185" cy="104" r="8" fill="#065f46" stroke="#34d399" strokeWidth="1.5"/>
              <rect x="225" y="68" width="8" height="14" rx="2" fill="#fef08a" opacity="0.7"/>
            </g>
            <text x="200" y="320" textAnchor="middle" fill="#34d399" fontSize="16" opacity="0.9" fontFamily="sans-serif" fontWeight="600">Vendor Portal</text>
            <text x="200" y="345" textAnchor="middle" fill="#6ee7b7" fontSize="12" opacity="0.6" fontFamily="sans-serif">Dispatch. Deliver. Done.</text>
          </svg>
        </div>
      </div>
    </div>
  );
}
