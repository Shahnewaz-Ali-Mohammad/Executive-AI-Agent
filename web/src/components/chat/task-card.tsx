"use client";

/**
 * A task proposed in the chat ("Ask Rahim to send the Q3 numbers by Friday").
 * The CEO checks or edits it and presses Create task. If it has an email, n8n
 * tells the assignee, and reminds them when it falls due.
 */
import { ExternalLink, ListTodo } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import type { TaskCard as TaskCardData } from "@/lib/cards";
import { CardFrame, DraftBadge, SavedBadge } from "./card-frame";

/** "2026-10-16" → "Fri 16 Oct 2026" (the date as the CEO gave it, no time-zone shift). */
function formatDueDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface TaskCardProps {
  card: TaskCardData;
  messageId: string;
  workspaceId: string;
  conversationId: string | null;
  onUpdated: (card: TaskCardData) => void;
  onCreated: () => void;
  onOpenTasks: () => void;
}

export function TaskCard({ card, messageId, workspaceId, conversationId, onUpdated, onCreated, onOpenTasks }: TaskCardProps) {
  const [draft, setDraft] = useState(card);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const created = Boolean(card.taskId);
  const id = (name: string) => `task-${messageId}-${name}`;
  const set = <K extends keyof TaskCardData>(key: K, value: TaskCardData[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function create() {
    setSaving(true);
    setProblem(null);
    try {
      const task = await api.createTask(workspaceId, {
        title: draft.title,
        details: draft.details,
        assigneeName: draft.assigneeName,
        assigneeEmail: draft.assigneeEmail,
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        timeZone: draft.timeZone,
        conversationId,
        messageId,
      });
      onUpdated({ ...draft, taskId: task.id });
      onCreated();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const due = card.dueDate ? `Due ${formatDueDate(card.dueDate)}, ${card.dueTime ?? "17:00"}` : "No due date";
    return (
      <CardFrame icon={<ListTodo className="size-4 text-ledger" aria-hidden />} title={card.title} status={<SavedBadge label="Task created" />}>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-slate">Assigned to</dt>
          <dd className="text-ink">
            {card.assigneeName ?? "—"}
            {card.assigneeEmail && <span className="text-slate"> · {card.assigneeEmail}</span>}
          </dd>
          <dt className="text-slate">When</dt>
          <dd className="text-ink">{due}</dd>
          {card.details && (
            <>
              <dt className="text-slate">Details</dt>
              <dd className="whitespace-pre-wrap text-ink">{card.details}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="quiet" onClick={onOpenTasks}>
            <ExternalLink className="size-3.5" aria-hidden /> Open in Tasks
          </Button>
          {card.assigneeEmail && <span className="text-xs text-slate">{card.assigneeName ?? "The assignee"} is emailed by the scheduler.</span>}
        </div>
      </CardFrame>
    );
  }

  return (
    <CardFrame icon={<ListTodo className="size-4 text-ledger" aria-hidden />} title="New task" status={<DraftBadge label="Not created" />}>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field id={id("title")} label="Task" wide>
          <input id={id("title")} className={INPUT_CLASS} value={draft.title} onChange={(e) => set("title", e.target.value)} disabled={saving} />
        </Field>
        <Field id={id("who")} label="Assigned to">
          <input
            id={id("who")}
            className={INPUT_CLASS}
            value={draft.assigneeName ?? ""}
            placeholder="Name"
            onChange={(e) => set("assigneeName", e.target.value || null)}
            disabled={saving}
          />
        </Field>
        <Field id={id("email")} label="Their email" hint="optional">
          <input
            id={id("email")}
            type="email"
            className={INPUT_CLASS}
            value={draft.assigneeEmail ?? ""}
            placeholder="name@company.com"
            onChange={(e) => set("assigneeEmail", e.target.value || null)}
            disabled={saving}
          />
        </Field>
        <Field id={id("date")} label="Due date" hint="optional">
          <input
            id={id("date")}
            type="date"
            className={INPUT_CLASS}
            value={draft.dueDate ?? ""}
            onChange={(e) => set("dueDate", e.target.value || null)}
            disabled={saving}
          />
        </Field>
        <Field id={id("time")} label="Time" hint={draft.dueDate && !draft.dueTime ? "17:00 if empty" : undefined}>
          <input
            id={id("time")}
            type="time"
            className={INPUT_CLASS}
            value={draft.dueTime ?? ""}
            onChange={(e) => set("dueTime", e.target.value || null)}
            disabled={saving || !draft.dueDate}
          />
        </Field>
        <Field id={id("details")} label="Details" wide>
          <textarea
            id={id("details")}
            rows={2}
            className={`${INPUT_CLASS} resize-y`}
            value={draft.details}
            onChange={(e) => set("details", e.target.value)}
            disabled={saving}
          />
        </Field>
      </div>
      {problem && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={create} disabled={saving || !draft.title.trim()}>
          {saving ? "Creating…" : "Create task"}
        </Button>
        <span className="text-xs text-slate">
          {draft.assigneeEmail ? "They'll get an email, and a reminder when it's due." : "Add an email to notify them."}
        </span>
      </div>
    </CardFrame>
  );
}
