/**
 * Building blocks for the full pages (Documents, Forms, Tasks, Notifications,
 * Status): a header with title, short description and actions; sections with
 * a heading; an empty state.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-5xl px-4 pt-6 pb-24 sm:px-8 lg:pb-12", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-serif text-[1.75rem] leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  actions,
  children,
  className,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("mt-8 first:mt-0", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-slate uppercase">
          {title} {count !== undefined && <span className="tabular-nums">{count}</span>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyBlock({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ledger-soft text-ledger">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate">{children}</div>}
    </div>
  );
}

/** Small rounded filter buttons ("All 12", "Open 3" …). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
            value === option.id
              ? "border-ink bg-ink text-paper"
              : "border-rule bg-surface text-slate hover:border-slate hover:text-ink",
          )}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1 tabular-nums opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Grey placeholder rows while a list loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex gap-3 px-4 py-4">
          <span className="size-11 animate-pulse rounded-md bg-paper" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-paper" />
            <span className="block h-3 w-2/3 animate-pulse rounded bg-paper" />
          </span>
        </li>
      ))}
    </ul>
  );
}
