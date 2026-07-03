import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line bg-white px-6 py-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-white", className)}>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4",
        highlight ? "border-brand/30 ring-1 ring-brand/10" : "border-line",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold",
          highlight ? "text-brand" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost";

export function Button({
  children,
  variant = "secondary",
  onClick,
  className,
  icon: Icon,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  onClick?: () => void;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const variants: Record<BtnVariant, string> = {
    primary: "bg-brand text-white hover:bg-blue-700 border-transparent",
    secondary: "bg-white text-ink border-line hover:bg-gray-50",
    ghost: "bg-transparent text-brand border-transparent hover:bg-brand-light",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        variants[variant],
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}
