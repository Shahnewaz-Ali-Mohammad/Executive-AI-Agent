"use client";

/**
 * System status: whether each part is working, and what to do if not.
 * Refreshes every 30 seconds while open.
 */
import { CheckCircle2, CircleDashed, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListSkeleton, Page, PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/dates";
import type { SystemCheck, SystemStatusDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

const STATE: Record<SystemCheck["state"], { label: string; Icon: typeof CheckCircle2; className: string }> = {
  ok: { label: "Working", Icon: CheckCircle2, className: "text-ledger" },
  warning: { label: "Needs attention", Icon: TriangleAlert, className: "text-amber" },
  error: { label: "Not working", Icon: XCircle, className: "text-alert" },
  off: { label: "Off", Icon: CircleDashed, className: "text-slate" },
};

export function StatusPage() {
  const [status, setStatus] = useState<SystemStatusDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    setChecking(true);
    return api
      .systemStatus()
      .then((next) => {
        setStatus(next);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not check."))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      api
        .systemStatus()
        .then((next) => !cancelled && setStatus(next))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not check."));
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const problems = status?.checks.filter((c) => c.state === "error").length ?? 0;

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="System status"
        description={
          status
            ? problems
              ? `${problems} part${problems > 1 ? "s" : ""} need${problems > 1 ? "" : "s"} attention · checked at ${formatTime(status.checkedAt)}`
              : `Everything is working · checked at ${formatTime(status.checkedAt)}`
            : "Checking every part of the system…"
        }
        actions={
          <Button variant="quiet" onClick={() => void load()} disabled={checking}>
            <RefreshCw className={cn("size-4", checking && "animate-spin")} aria-hidden /> Check again
          </Button>
        }
      />

      {error && <p className="mb-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      {!status ? (
        <ListSkeleton rows={6} />
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
          {status.checks.map((check) => {
            const { label, Icon, className } = STATE[check.state];
            return (
              <li key={check.id} className="flex gap-3 px-4 py-4">
                <Icon className={cn("mt-0.5 size-5 shrink-0", className)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium text-ink">{check.label}</p>
                    <p className={cn("text-xs font-medium", className)}>{label}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-slate">{check.detail}</p>
                  {check.fix && (
                    <p className="mt-2 rounded-md bg-paper px-3 py-2 text-xs text-ink/85">
                      <span className="font-medium">How to fix: </span>
                      {check.fix}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
