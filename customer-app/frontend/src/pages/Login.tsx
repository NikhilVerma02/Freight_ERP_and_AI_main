import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import ThemeToggle from "../components/ThemeToggle";

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
      if (loggedIn.role !== "customer" && loggedIn.role !== "admin") {
        logout();
        setError(`This account has role '${loggedIn.role}'. Please use the ERP or Vendor Portal.`);
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-violet-400 dark:focus:ring-violet-400/20";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-purple-50 to-white px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10 dark:shadow-black/40">
        {/* Left panel */}
        <div className="flex w-full flex-col gap-5 p-8 sm:p-10 md:w-[55%]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-lg font-bold text-white shadow-lg shadow-violet-500/30">
            C
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customer Portal</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Place orders, track shipments and raise claims.</p>
          </div>

          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <input className={inputCls} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input type="password" className={inputCls} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-800/50">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/25 hover:bg-violet-500 transition-colors disabled:opacity-60">
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 space-y-1 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">Demo credentials &mdash; password: <span className="font-mono text-violet-600 dark:text-violet-400">Admin@123</span></p>
            <p><span className="font-mono text-slate-700 dark:text-slate-200">customer1</span> &nbsp;Customer</p>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Not a customer?{" "}
            <a href="http://localhost:5173" className="font-medium text-violet-600 hover:underline dark:text-violet-400">ERP Portal &rarr;</a>
            {"  "}
            <a href="http://localhost:5175" className="font-medium text-violet-600 hover:underline dark:text-violet-400">Vendor Portal &rarr;</a>
          </p>
        </div>

        {/* Right illustration */}
        <div className="relative hidden w-[45%] md:block">
          <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
            <defs>
              <linearGradient id="cpBg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2e1065" />
                <stop offset="100%" stopColor="#1a0533" />
              </linearGradient>
            </defs>
            <rect width="400" height="600" fill="url(#cpBg)" />
            <circle cx="200" cy="220" r="130" fill="#7c3aed" opacity="0.10" />
            <circle cx="200" cy="220" r="90" fill="#7c3aed" opacity="0.08" />
            <g transform="translate(130, 140)">
              <polygon points="70,10 130,42 130,106 70,138 10,106 10,42" fill="#4c1d95" stroke="#7c3aed" strokeWidth="1.5" opacity="0.9"/>
              <polygon points="70,10 130,42 70,74 10,42" fill="#5b21b6" stroke="#8b5cf6" strokeWidth="1" opacity="0.9"/>
              <polygon points="70,74 130,42 130,106 70,138" fill="#3b0764" stroke="#7c3aed" strokeWidth="1" opacity="0.9"/>
              <polygon points="70,74 10,42 10,106 70,138" fill="#4c1d95" stroke="#6d28d9" strokeWidth="1" opacity="0.9"/>
              <rect x="42" y="36" width="56" height="6" rx="3" fill="#c4b5fd" opacity="0.7"/>
            </g>
            <text x="200" y="320" textAnchor="middle" fill="#a78bfa" fontSize="16" opacity="0.9" fontFamily="sans-serif" fontWeight="600">Customer Portal</text>
            <text x="200" y="345" textAnchor="middle" fill="#c4b5fd" fontSize="12" opacity="0.6" fontFamily="sans-serif">Order. Track. Claim.</text>
          </svg>
        </div>
      </div>
    </div>
  );
}
