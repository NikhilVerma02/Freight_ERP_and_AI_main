import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-white shadow-card ring-1 ring-black/5 dark:bg-navy-800 dark:ring-white/10 p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
