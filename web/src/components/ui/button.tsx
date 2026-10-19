/**
 * The app's button. Three looks:
 *  - primary: the one main action in a view (accent colour)
 *  - quiet:   secondary actions, outlined
 *  - ghost:   icon buttons and low-emphasis actions
 */
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "quiet" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ledger text-surface hover:opacity-90",
  quiet: "border border-rule bg-surface text-ink hover:border-slate",
  ghost: "text-slate hover:bg-paper hover:text-ink",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** The button look for a link (`<Link className={buttonStyles("quiet")}>`). */
export function buttonStyles(variant: Variant = "primary", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, className)}
      {...props}
    />
  );
}

/** Square icon-only button. Always pass an aria-label. */
export function IconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return (
    <button
      type={type}
      title={props["aria-label"]}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
