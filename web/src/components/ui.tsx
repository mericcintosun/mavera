import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-card p-5 ${className}`}
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonProps) {
  const look =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-strong"
      : "border border-line bg-transparent text-ink hover:bg-paper";
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...rest}
    />
  );
}

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`underline decoration-line underline-offset-4 hover:text-accent ${className}`}
    >
      {children}
    </a>
  );
}

export function Stat({
  label,
  value,
  big = false,
  accent = false,
  flashKey,
  title,
}: {
  label: string;
  value: string;
  big?: boolean;
  accent?: boolean;
  flashKey?: number;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        key={flashKey}
        title={title}
        className={`tabular mt-1 truncate font-semibold tracking-tight ${big ? "text-3xl sm:text-4xl" : "text-xl"} ${accent ? "text-accent" : ""} ${flashKey ? "animate-flash" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-line ${className}`}
    />
  );
}
