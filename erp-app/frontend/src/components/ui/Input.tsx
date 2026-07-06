import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Optional leading icon (e.g. for login/signup forms) — unused by existing callers. */
  icon?: React.ReactNode;
}

export function Input({ label, className = "", id, icon, wrapperClassName = "", ...props }: InputProps & { wrapperClassName?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-accent dark:focus:ring-accent/30 dark:disabled:opacity-40 ${
            icon ? "pl-9 pr-3" : "px-3"
          } ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className = "", id, children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:focus:border-accent dark:focus:ring-accent/30 dark:disabled:opacity-40 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, className = "", id, ...props }: TextAreaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={`rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-accent dark:focus:ring-accent/30 dark:disabled:opacity-40 ${className}`}
        {...props}
      />
    </div>
  );
}
