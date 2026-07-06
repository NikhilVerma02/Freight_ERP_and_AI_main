import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function Input({ icon, className = "", ...props }: InputProps) {
  if (!icon) {
    return (
      <input
        {...props}
        className={`ai-input ${className}`}
      />
    );
  }
  // Icon lives in the flex wrapper (outside the <input> element) so the browser's
  // credential/autofill injected icon can never overlap with it.
  return (
    <div className={`ai-input-wrapper ${className}`}>
      <span className="pointer-events-none shrink-0 text-slate-400 dark:text-slate-500">
        {icon}
      </span>
      <input {...props} className="ai-input-inner" />
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`ai-input font-mono resize-none ${className}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      {...rest}
      className={`ai-input cursor-pointer ${className}`}
    />
  );
}

export function Label({ className = "", children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`ai-label ${className}`} {...props}>
      {children}
    </label>
  );
}
