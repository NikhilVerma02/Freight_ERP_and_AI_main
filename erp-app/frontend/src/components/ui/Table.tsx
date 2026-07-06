import React from "react";

export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function Table<T extends { id: number | string }>({
  columns,
  rows,
  emptyMessage = "No records found.",
  loading = false,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  loading?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none">
      <table className="w-full min-w-full divide-y divide-slate-200 text-sm dark:divide-navy-700">
        <thead className="bg-slate-50 dark:bg-navy-900">
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-navy-700/50">
                {columns.map((col, i) => (
                  <td key={i} className={`px-4 py-3 align-middle text-slate-700 dark:text-slate-300 ${col.className ?? ""}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
