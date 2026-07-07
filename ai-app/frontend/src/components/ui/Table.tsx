import React from "react";

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800 ${className}`}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-100 dark:bg-slate-900/80 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">
      {children}
    </thead>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{children}</tbody>;
}

export function Tr({ children, className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-slate-800 dark:text-slate-200 ${className}`}>{children}</td>;
}
