"use client";

/** Frame for the right-hand panel (saved form, template editor): title, close button, scrolling body. */
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/button";

export function SidePanel({
  label,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  label: string;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex h-full flex-col bg-surface">
      <header className="flex items-start gap-2 border-b border-rule px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-ink" title={title}>
            {title}
          </h2>
          {subtitle && <div className="mt-0.5 text-xs text-slate">{subtitle}</div>}
        </div>
        <IconButton aria-label="Close" onClick={onClose} className="-mt-1 -mr-1">
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">{footer}</footer>}
    </section>
  );
}
