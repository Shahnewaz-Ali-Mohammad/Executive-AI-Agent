"use client";

/**
 * A scheduled report or reminder proposed in the chat ("Every Monday at 8,
 * give me a risk scan of the board pack"). The CEO checks or edits it and
 * presses Schedule; n8n's scheduler then runs it and the result appears
 * under the bell (and by email, if set).
 */
import { BellRing, CalendarClock, ExternalLink } from "lucide-react";
import { useState } from "react";
import { ScheduleFields } from "@/components/automation/fields";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { ScheduleCard as ScheduleCardData } from "@/lib/cards";
import { formatDateTime } from "@/lib/dates";
import { getResponseMode } from "@/lib/response-modes";
import { describeRecurrence } from "@/lib/schedule";
import { CardFrame, DraftBadge, SavedBadge } from "./card-frame";

interface ScheduleCardProps {
  card: ScheduleCardData;
  messageId: string;
  workspaceId: string;
  conversationId: string | null;
  onUpdated: (card: ScheduleCardData) => void;
  onCreated: () => void;
  onOpenTasks: () => void;
}

export function ScheduleCard({
  card,
  messageId,
  workspaceId,
  conversationId,
  onUpdated,
  onCreated,
  onOpenTasks,
}: ScheduleCardProps) {
  const [draft, setDraft] = useState(card);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const created = Boolean(card.scheduleId);
  const isReport = draft.scheduleKind === "report";
  const Icon = isReport ? CalendarClock : BellRing;

  async function create() {
    setSaving(true);
    setProblem(null);
    try {
      const schedule = await api.createSchedule(workspaceId, {
        scheduleKind: draft.scheduleKind,
        title: draft.title,
        prompt: draft.prompt,
        mode: isReport ? draft.mode : null,
        recurrence: draft.recurrence,
        timeZone: draft.timeZone,
        notifyEmail: draft.notifyEmail,
        conversationId,
        messageId,
      });
      onUpdated({ ...draft, mode: schedule.mode, scheduleId: schedule.id, nextRunAt: schedule.nextRunAt });
      onCreated();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not create the schedule.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <CardFrame icon={<Icon className="size-4 text-ledger" aria-hidden />} title={card.title} status={<SavedBadge label="Scheduled" />}>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-slate">{isReport ? "Report" : "Reminder"}</dt>
          <dd className="whitespace-pre-wrap text-ink">{card.prompt}</dd>
          <dt className="text-slate">When</dt>
          <dd className="text-ink">
            {describeRecurrence(card.recurrence)} <span className="text-slate">({card.timeZone})</span>
          </dd>
          {card.nextRunAt && (
            <>
              <dt className="text-slate">Next</dt>
              <dd className="text-ink">{formatDateTime(card.nextRunAt)}</dd>
            </>
          )}
          {isReport && card.mode && (
            <>
              <dt className="text-slate">Style</dt>
              <dd className="text-ink">{getResponseMode(card.mode).label}</dd>
            </>
          )}
          {card.notifyEmail && (
            <>
              <dt className="text-slate">Email</dt>
              <dd className="text-ink">{card.notifyEmail}</dd>
            </>
          )}
        </dl>
        <Button variant="quiet" onClick={onOpenTasks}>
          <ExternalLink className="size-3.5" aria-hidden /> Open in Tasks
        </Button>
      </CardFrame>
    );
  }

  return (
    <CardFrame
      icon={<Icon className="size-4 text-ledger" aria-hidden />}
      title={isReport ? "New scheduled report" : "New reminder"}
      status={<DraftBadge label="Not scheduled" />}
    >
      <ScheduleFields
        idPrefix={`schedule-${messageId}`}
        value={draft}
        onChange={(value) => setDraft((current) => ({ ...current, ...value }))}
        disabled={saving}
      />
      <p className="text-xs text-slate">
        {describeRecurrence(draft.recurrence)}, {draft.timeZone}. Results appear under the bell
        {draft.notifyEmail ? " and by email" : ""}.
      </p>
      {problem && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={create} disabled={saving || !draft.title.trim() || !draft.prompt.trim()}>
          {saving ? "Scheduling…" : "Schedule"}
        </Button>
      </div>
    </CardFrame>
  );
}
