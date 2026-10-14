/** A labelled input, styled like the form inputs. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const INPUT_CLASS =
  "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-slate/60 focus:border-ledger focus:outline-none disabled:opacity-70";

export function Field({
  id,
  label,
  hint,
  wide,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate">
        <span>{label}</span>
        {hint && <span className="font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
