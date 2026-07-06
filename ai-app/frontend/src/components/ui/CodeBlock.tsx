import React from "react";

export function CodeBlock({ data, className = "" }: { data: unknown; className?: string }) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre
      className={`overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/80 p-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300 font-mono ${className}`}
    >
      <code>{text}</code>
    </pre>
  );
}
