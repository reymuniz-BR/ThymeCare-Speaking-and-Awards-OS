/**
 * Shared shell furniture for the operating system: panels, stat tiles, tab
 * strips and table primitives. Everything here is deliberately compact so the
 * app reads as dense B2B infrastructure rather than a marketing page.
 */
import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_6%,transparent)]",
        className,
      )}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/60 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[12px] font-semibold tracking-wide uppercase">{title}</h2>
            {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Compact program signal for the summary strip. */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "critical" | "warning" | "primary" | "info";
}) {
  const accent = {
    neutral: "border-border",
    critical: "border-critical/45",
    warning: "border-warning/60",
    primary: "border-primary/45",
    info: "border-info/45",
  }[tone];
  const valueTone = {
    neutral: "text-foreground",
    critical: "text-critical",
    warning: "text-warning-foreground",
    primary: "text-primary",
    info: "text-info",
  }[tone];
  return (
    <div
      className={cn("rounded-lg border border-border border-l-[3px] bg-surface px-4 py-3", accent)}
    >
      <div className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("mt-1 tabnum text-[24px] leading-none font-semibold", valueTone)}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

export function TabStrip<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { key: T; label: string; count?: number }[];
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-5 border-b border-border", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pb-2.5 text-[13px] transition-colors",
            value === t.key
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-px tabnum text-[10.5px] font-medium",
                value === t.key ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {t.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-surface-2/70 text-[10.5px] tracking-[0.07em] text-muted-foreground uppercase">
      {children}
    </thead>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string | undefined;
}) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      {children ? <div className="mt-1 text-[12px] text-muted-foreground">{children}</div> : null}
    </div>
  );
}
