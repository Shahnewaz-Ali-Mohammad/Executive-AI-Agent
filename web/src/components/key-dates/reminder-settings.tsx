"use client";

/**
 * How the CEO hears about key dates: reminders 30 days, 7 days and on the
 * day (under the bell, and by email if an address is set), and an optional
 * summary every Monday morning.
 */
import { BellRing } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { INPUT_CLASS } from "@/components/ui/field";
import { routes } from "@/lib/routes";

export function ReminderSettings() {
  const ws = useWorkspace();
  const { toast } = useFeedback();
  const { settings } = ws.keyFacts;
  const [email, setEmail] = useState<string | null>(null); // null = not edited
  const [busy, setBusy] = useState(false);
  const shownEmail = email ?? settings.reminderEmail ?? "";
  const changed = email !== null && email.trim() !== (settings.reminderEmail ?? "");
  const saved = Boolean(settings.weeklySummaryScheduleId);
  // Shown straight away while it saves.
  const [pending, setPending] = useState<boolean | null>(null);
  const weekly = pending ?? saved;

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await ws.keyFacts.saveSettings({ reminderEmail: shownEmail.trim() || null });
    setBusy(false);
    if (ok) {
      setEmail(null);
      toast(shownEmail.trim() ? "Reminders will also be emailed" : "Reminders only under the bell now");
    }
  }

  async function toggleWeekly() {
    const next = !weekly;
    setPending(next);
    setBusy(true);
    const ok = await ws.keyFacts.saveSettings({
      weeklySummary: next,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    setPending(null);
    if (ok) {
      toast(next ? "Weekly summary every Monday at 08:00" : "Weekly summary turned off");
      void ws.automations.refresh();
    }
  }

  return (
    <section aria-label="Reminders" className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-ledger-soft text-ledger">
          <BellRing className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-medium text-ink">Reminders</h2>
            <p className="text-sm text-slate">
              You&apos;re reminded 30 days and 7 days before each date, and on the day, under the bell. Dismissed dates
              are skipped.
            </p>
          </div>
          <form onSubmit={saveEmail} className="flex flex-wrap items-center gap-2">
            <label htmlFor="reminder-email" className="text-xs font-medium text-slate">
              Also email
            </label>
            <input
              id="reminder-email"
              type="email"
              className={`${INPUT_CLASS} max-w-72 flex-1`}
              placeholder="name@company.com (optional)"
              value={shownEmail}
              onChange={(e) => setEmail(e.target.value)}
            />
            {changed && (
              <Button type="submit" variant="quiet" disabled={busy}>
                Save
              </Button>
            )}
          </form>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--ledger)]"
              checked={weekly}
              disabled={busy}
              onChange={() => void toggleWeekly()}
            />
            <span>
              Send me a summary of the next 30 days every Monday at 08:00
              {saved && (
                <>
                  {" · "}
                  <Link href={routes.tasks(ws.workspaceId)} className="text-ledger underline-offset-2 hover:underline">
                    see it in Tasks &amp; schedules
                  </Link>
                </>
              )}
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
