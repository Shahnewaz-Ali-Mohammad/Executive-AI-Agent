"use client";

/** The frame shared by the cards under an answer (forms, tasks, schedules). */
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function CardFrame({
  icon,
  title,
  status,
  children,
}: {
  icon: ReactNode;
  title: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-lg border border-rule bg-surface font-sans shadow-[0_1px_0_var(--rule)]">
      <header className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
        {icon}
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</h3>
        {status}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function SavedBadge({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-ledger-soft px-2 py-0.5 text-xs text-ledger">
      <Check className="size-3" aria-hidden /> {label}
    </span>
  );
}

export function DraftBadge({ label = "Not saved" }: { label?: string }) {
  return <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs text-amber">{label}</span>;
}
