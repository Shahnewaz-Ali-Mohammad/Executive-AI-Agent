"use client";

/**
 * Tasks & schedules.
 *
 *   Scheduler   whether n8n's scheduler is checking in (it runs everything here)
 *   Tasks       open (soonest due first, overdue in red, whether the assignee
 *               was emailed) and done; mark done, reopen, delete
 *   Scheduled   reports and reminders: when they run next, how the last run
 *               went (and its result), run now, pause, resume, delete
 *
 * Created from the chat ("Ask Rahim to…", "Every Monday…") or with the
 * New task / New schedule buttons.
 */
import {
  BellRing,
  CalendarClock,
  Circle,
  CircleCheck,
  ListTodo,
  Mail,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, IconButton } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader, Section } from "@/components/ui/page";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { getResponseMode } from "@/lib/response-modes";
import { routes } from "@/lib/routes";
import { describeRecurrence } from "@/lib/schedule";
import type { ScheduleDTO, SchedulerStatusDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type TaskFilter = "open" | "done" | "all";

/** The current time, updated every minute (for "overdue"). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function TasksPage() {
  const ws = useWorkspace();
  const { confirm, toast } = useFeedback();
  const { tasks, schedules, loading, error } = ws.automations;
  const [filter, setFilter] = useState<TaskFilter>("open");
  const now = useNow();

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");
  const visible = filter === "open" ? open : filter === "done" ? done : tasks;
  const overdue = useMemo(
    () => open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now).length,
    [open, now],
  );

  async function deleteTask(task: TaskDTO) {
    const ok = await confirm({
      title: `Delete the task “${task.title}”?`,
      message: "No more reminders are sent for it.",
      confirmLabel: "Delete task",
      danger: true,
    });
    if (!ok) return;
    if (await ws.automations.deleteTask(task.id)) toast("Task deleted");
  }

  async function deleteSchedule(schedule: ScheduleDTO) {
    const ok = await confirm({
      title: `Delete “${schedule.title}”?`,
      message: "It won't run again. Results already delivered stay under the bell.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    if (await ws.automations.deleteSchedule(schedule.id)) {
      toast(`${schedule.kind === "report" ? "Report" : "Reminder"} deleted`);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Tasks & schedules"
        description={
          open.length
            ? `${open.length} open task${open.length > 1 ? "s" : ""}${overdue ? `, ${overdue} overdue` : ""} · ${
                schedules.filter((s) => s.active).length
              } active schedule${schedules.filter((s) => s.active).length === 1 ? "" : "s"}.`
            : "Delegate work and get reports on a schedule. n8n runs them on time and tells you under the bell."
        }
        actions={
          <>
            <Button variant="quiet" onClick={() => ws.openPanel({ kind: "new-schedule" })}>
              <CalendarClock className="size-4" aria-hidden /> New schedule
            </Button>
            <Button onClick={() => ws.openPanel({ kind: "new-task" })}>
              <Plus className="size-4" aria-hidden /> New task
            </Button>
          </>
        }
      />

      <SchedulerBanner scheduler={ws.notifications.scheduler} statusHref={routes.status(ws.workspaceId)} />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          <p className="flex-1">{error}</p>
          <button type="button" onClick={ws.automations.clearError} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <Section
        title="Tasks"
        actions={
          tasks.length > 0 && (
            <FilterChips
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "open", label: "Open", count: open.length },
                { id: "done", label: "Done", count: done.length },
                { id: "all", label: "All", count: tasks.length },
              ]}
            />
          )
        }
      >
        {loading ? (
          <ListSkeleton rows={3} />
        ) : tasks.length === 0 ? (
          <EmptyBlock icon={<ListTodo className="size-5" aria-hidden />} title="No tasks yet">
            Ask in the chat: <em>“Ask Rahim to send the Q3 sales figures by Friday, rahim@company.com”</em>, or press{" "}
            <strong className="font-medium text-ink">New task</strong>.
          </EmptyBlock>
        ) : visible.length === 0 ? (
          <EmptyBlock title={filter === "open" ? "All done" : "Nothing finished yet"}>
            {filter === "open" ? "No open tasks. Finished ones are under Done." : "Tasks you mark as done appear here."}
          </EmptyBlock>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
            {visible.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                onToggle={async () => {
                  const next = task.status === "open" ? "done" : "open";
                  if (await ws.automations.setTaskStatus(task.id, next)) {
                    toast(next === "done" ? "Marked as done" : "Task reopened");
                  }
                }}
                onDelete={() => void deleteTask(task)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Scheduled reports & reminders" count={schedules.length}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : schedules.length === 0 ? (
          <EmptyBlock icon={<CalendarClock className="size-5" aria-hidden />} title="Nothing scheduled">
            Ask in the chat: <em>“Every Monday at 8:00 give me a risk scan of the latest board pack”</em> or{" "}
            <em>“Remind me tomorrow at 3pm to call the bank.”</em>
          </EmptyBlock>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {schedules.map((schedule) => (
              <ScheduleCardItem
                key={schedule.id}
                schedule={schedule}
                onRunNow={async () => {
                  if (await ws.automations.runScheduleNow(schedule.id)) {
                    toast("Queued · it runs within a minute", "info");
                  }
                }}
                onToggle={async () => {
                  if (await ws.automations.setScheduleActive(schedule.id, !schedule.active)) {
                    toast(schedule.active ? "Paused" : "Resumed");
                  }
                }}
                onDelete={() => void deleteSchedule(schedule)}
                onOpenResult={(notificationId) => ws.openPanel({ kind: "notification", notificationId })}
              />
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}

/** "Scheduler running · email on", or a clear warning that nothing will run. */
function SchedulerBanner({ scheduler, statusHref }: { scheduler: SchedulerStatusDTO | null; statusHref: string }) {
  if (!scheduler) return null;
  if (scheduler.healthy) {
    return (
      <p
        className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate"
        title={scheduler.lastCheckAt ? `Last check ${formatFullDateTime(scheduler.lastCheckAt)}` : undefined}
      >
        <span className="size-2 rounded-full bg-ledger" aria-hidden />
        n8n scheduler running
        <span aria-hidden>·</span>
        {scheduler.emailEnabled ? "emails on" : "emails off (add SMTP settings to .env to turn them on)"}
      </p>
    );
  }
  return (
    <div role="status" className="mb-6 rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
      <p className="font-medium">The n8n scheduler isn&apos;t running</p>
      <p className="mt-0.5">
        Reports, reminders and task emails wait until it is.
        {scheduler.lastCheckAt ? ` Last seen ${formatDateTime(scheduler.lastCheckAt)}.` : ""} Start it with{" "}
        <code className="rounded bg-surface/60 px-1 font-mono text-xs">docker compose up -d</code>, then check{" "}
        <Link href={statusHref} className="underline">
          System status
        </Link>
        .
      </p>
    </div>
  );
}

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "email queued", className: "text-amber" },
  pending: { label: "sending email", className: "text-amber" },
  sent: { label: "emailed", className: "text-ledger" },
  failed: { label: "email failed", className: "text-alert" },
  skipped: { label: "email off", className: "text-slate" },
};

function TaskRow({
  task,
  now,
  onToggle,
  onDelete,
}: {
  task: TaskDTO;
  now: number;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status !== "open";
  const overdue = !done && task.dueAt !== null && new Date(task.dueAt).getTime() < now;
  const email = task.assignmentEmail ? EMAIL_STATUS[task.assignmentEmail] : null;

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-paper">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” as done`}
        title={done ? "Reopen" : "Mark as done"}
        className="mt-0.5 shrink-0 text-slate transition-colors hover:text-ledger"
      >
        {done ? <CircleCheck className="size-5 text-ledger" aria-hidden /> : <Circle className="size-5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-ink", done && "text-slate line-through")}>{task.title}</p>
        {task.details && <p className="mt-0.5 line-clamp-2 text-sm text-slate">{task.details}</p>}
        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate tabular-nums">
          <span>{task.assigneeName ?? "Unassigned"}</span>
          {task.assigneeEmail && <span className="truncate">{task.assigneeEmail}</span>}
          {task.dueAt && (
            <span className={cn(overdue && "font-medium text-alert")} title={formatFullDateTime(task.dueAt)}>
              {overdue ? "Overdue · " : "Due "}
              {formatDateTime(task.dueAt)}
            </span>
          )}
          {done && task.completedAt && <span>Done {formatDateTime(task.completedAt)}</span>}
          {email && !done && <span className={email.className}>{email.label}</span>}
        </p>
      </div>
      <IconButton
        aria-label={`Delete “${task.title}”`}
        onClick={onDelete}
        className="size-8 opacity-100 transition-opacity hover:text-alert lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
      >
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

function ScheduleCardItem({
  schedule,
  onRunNow,
  onToggle,
  onDelete,
  onOpenResult,
}: {
  schedule: ScheduleDTO;
  onRunNow: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onOpenResult: (notificationId: string) => void;
}) {
  const Icon = schedule.kind === "report" ? CalendarClock : BellRing;
  const last = schedule.lastRun;
  const pending = last && (last.status === "queued" || last.status === "claimed" || last.status === "running");
  // A one-off that has run: nothing to pause or resume.
  const finished = !schedule.active && !schedule.nextRunAt && schedule.lastRunAt !== null;

  let state: ReactNode;
  if (pending) {
    state = <span className="text-amber">{last.status === "queued" ? "Queued · runs within a minute" : "Running now…"}</span>;
  } else if (schedule.active && schedule.nextRunAt) {
    state = <span title={formatFullDateTime(schedule.nextRunAt)}>Next: {formatDateTime(schedule.nextRunAt)}</span>;
  } else if (finished) {
    state = <span title={formatFullDateTime(schedule.lastRunAt!)}>Ran {formatDateTime(schedule.lastRunAt!)}</span>;
  } else {
    state = <span className="font-medium">Paused</span>;
  }

  return (
    <li
      className={cn(
        "flex flex-col rounded-xl border border-rule bg-surface p-4",
        !schedule.active && !pending && "bg-paper/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            schedule.active || pending ? "bg-ledger-soft text-ledger" : "bg-paper text-slate",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{schedule.title}</p>
          <p className="text-xs text-slate">
            {schedule.kind === "report" ? "Report" : "Reminder"} · {describeRecurrence(schedule.recurrence)}
            {schedule.kind === "report" && schedule.mode && ` · ${getResponseMode(schedule.mode).label}`}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-ink/85" title={schedule.prompt}>
        {schedule.prompt}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate tabular-nums">
        {state}
        {schedule.notifyEmail && (
          <span className="flex items-center gap-1" title={`Also emailed to ${schedule.notifyEmail}`}>
            <Mail className="size-3" aria-hidden /> {schedule.notifyEmail}
          </span>
        )}
      </div>
      {last && !pending && (
        <p className={cn("mt-1 text-xs", last.status === "failed" ? "text-alert" : "text-slate")} title={last.error ?? undefined}>
          {last.status === "failed" ? `Last run failed ${formatDateTime(last.at)}` : `Last run ${formatDateTime(last.at)}`}
          {last.notificationId && (
            <>
              {" · "}
              <button type="button" onClick={() => onOpenResult(last.notificationId!)} className="text-ledger hover:underline">
                {last.status === "failed" ? "See why" : "View result"}
              </button>
            </>
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1 border-t border-rule pt-3">
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onRunNow} disabled={Boolean(pending)}>
          <Zap className="size-3.5" aria-hidden /> Run now
        </Button>
        {!finished && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onToggle}>
            {schedule.active ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            {schedule.active ? "Pause" : "Resume"}
          </Button>
        )}
        <Button variant="ghost" className="ml-auto px-2 py-1 text-xs hover:text-alert" onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden /> Delete
        </Button>
      </div>
    </li>
  );
}
