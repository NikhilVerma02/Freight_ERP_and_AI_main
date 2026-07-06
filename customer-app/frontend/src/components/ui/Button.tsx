import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const vars = {
    primary: "bg-accent text-white hover:bg-accent-dark focus:ring-accent/40",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
  };
  return <button className={`${base} ${vars[variant]} ${className}`} {...props}>{children}</button>;
}
