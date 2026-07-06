import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function Card({ className = "", glow = false, children, ...props }: CardProps) {
  return (
    <div
      className={`ai-card ${glow ? "ai-card-glow" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ai-card-header px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = "", children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-sm font-semibold tracking-wide ai-text-primary ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ className = "", children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`mt-0.5 text-xs font-mono uppercase tracking-wider text-accent-500 dark:text-accent-400/80 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardBody({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
