import React, { useRef, useState } from "react";
import { ThemePreference, useTheme } from "../lib/useTheme";

function SunIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7l4 4 6-6" />
    </svg>
  );
}

const OPTIONS: { value: ThemePreference; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: "light",  label: "Light",   Icon: SunIcon },
  { value: "dark",   label: "Dark",    Icon: MoonIcon },
  { value: "system", label: "Default", Icon: MonitorIcon },
];

function ActiveIcon({ theme }: { theme: ThemePreference }) {
  if (theme === "light")  return <SunIcon className="h-[18px] w-[18px]" />;
  if (theme === "dark")   return <MoonIcon className="h-[18px] w-[18px]" />;
  return <MonitorIcon className="h-[18px] w-[18px]" />;
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        aria-label="Toggle theme"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <ActiveIcon theme={theme} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[200] mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl dark:shadow-black/40">
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                onClick={() => { setTheme(value); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent-500/10 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {active && <span className="text-accent-600 dark:text-accent-300"><CheckIcon /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
