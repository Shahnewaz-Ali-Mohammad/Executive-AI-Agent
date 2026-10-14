"use client";

/**
 * The Tasks tab in the sidebar.
 *
 *   Scheduler   whether n8n's scheduler is checking in (it runs everything below)
 *   Scheduled   reports and reminders: next run, last result, run now / pause / delete
 *   Tasks       open tasks (soonest due first, overdue in red), then finished ones
 *
 * Everything here is created from the chat ("Ask Rahim to…", "Every Monday…").
 */
import {
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  Mail,
  Pause,
  Play,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { getResponseMode } from "@/lib/response-modes";
import { describeRecurrence } from "@/lib/schedule";
import type { ScheduleDTO, SchedulerStatusDTO, TaskDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TasksPanelProps {
  tasks: TaskDTO[];
  schedules: ScheduleDTO[];
  scheduler: SchedulerStatusDTO | null;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onSetTaskStatus: (id: string, status: TaskDTO["status"]) => void;
  onDeleteTask: (id: string) => void;
  onSetScheduleActive: (id: string, active: boolean) => void;
  onRunScheduleNow: (id: string) => void;
  onDeleteSchedule: (id: string) => void;
}

export function TasksPanel(props: TasksPanelProps) {
  const { tasks, schedules, scheduler, loading, error } = props;
  const [showDone, setShowDone] = useState(false);
  const now = useNow();

  if (loading) return <p className="px-4 py-3 text-sm text-slate">Loading tasks…</p>;

  const open = tasks.filter((t) => t.status === "open");
  const finished = tasks.filter((t) => t.status !== "open");

  return (
    <div className="space-y-5">
      <SchedulerStatus scheduler={scheduler} />

      {error && (
        <div role="alert" className="mx-3 flex items-start gap-2 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          <p className="flex-1">{error}</p>
          <button type="button" onClick={props.onClearError} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ---------- Scheduled ---------- */}
      <section aria-label="Scheduled reports and reminders" className="space-y-1">
        <SectionTitle label="Scheduled" count={schedules.length} />
        {schedules.length === 0 ? (
          <p className="px-4 text-sm text-slate">
            Nothing scheduled. Try: <em>“Every Monday at 8:00 give me a risk scan of the latest board pack”</em> or{" "}
            <em>“Remind me tomorrow at 3pm to call the bank.”</em>
          </p>
        ) : (
          <ul className="px-2">
            {schedules.map((schedule) => (
              <ScheduleRow key={schedule.id} schedule={schedule} {...props} />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Tasks ---------- */}
      <section aria-label="Tasks" className="space-y-1">
        <SectionTitle label="Tasks" count={open.length} />
        {open.length === 0 && (
          <p className="px-4 text-sm text-slate">
            {finished.length ? "All done." : <>No open tasks. Try: <em>“Ask Rahim to send the Q3 sales figures by Friday.”</em></>}
          </p>
        )}
        <ul className="px-2">
          {open.map((task) => (
            <TaskRow key={task.id} task={task} now={now} {...props} />
          ))}
        </ul>

        {finished.length > 0 && (
          <div className="px-2 pt-1">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate hover:bg-paper hover:text-ink"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} aria-hidden />
              Done <span className="tabular-nums">{finished.length}</span>
            </button>
            {showDone && (
              <ul>
                {finished.map((task) => (
                  <TaskRow key={task.id} task={task} now={now} {...props} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** The current time, updated every minute (for "overdue"). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="px-4 pb-1 text-[0.7rem] font-medium tracking-wide text-slate uppercase">
      {label} <span className="tabular-nums">{count}</span>
    </h3>
  );
}

/** "Scheduler running · email on" or a warning that nothing will run. */
function SchedulerStatus({ scheduler }: { scheduler: SchedulerStatusDTO | null }) {
  if (!scheduler) return null;
  if (scheduler.healthy) {
    return (
      <p
        className="mx-4 flex items-center gap-2 text-xs text-slate"
        title={scheduler.lastCheckAt ? `Last check ${formatFullDateTime(scheduler.lastCheckAt)}` : undefined}
      >
        <span className="size-2 rounded-full bg-ledger" aria-hidden />
        <span>
          n8n scheduler running
          {" · "}
          {scheduler.emailEnabled ? "email on" : "email off (no SMTP in .env)"}
        </span>
      </p>
    );
  }
  return (
    <div className="mx-3 rounded-md bg-amber-soft px-3 py-2 text-xs text-amber" role="status">
      <p className="font-medium">The n8n scheduler isn&apos;t running</p>
      <p className="mt-0.5">
        Scheduled reports, reminders and task emails wait until it is.{" "}
        {scheduler.lastCheckAt ? `Last seen ${formatDateTime(scheduler.lastCheckAt)}. ` : ""}
        Start it with <code className="font-mono">docker compose up -d n8n</code>.
      </p>
    </div>
  );
}

function RowAction({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate transition-colors hover:bg-surface",
        danger ? "hover:text-alert" : "hover:text-ink",
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/** Delete with a second click to confirm (no browser dialogs). */
function DeleteAction({ onConfirm, compact }: { onConfirm: () => void; compact?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (compact && !armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label="Delete task"
        title="Delete"
        className="rounded p-1 text-slate hover:bg-surface hover:text-alert"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    );
  }
  return armed ? (
    <span className="flex items-center gap-1">
      <RowAction label="Delete" danger onClick={onConfirm}>
        <Check className="size-3" aria-hidden />
      </RowAction>
      <RowAction label="Keep" onClick={() => setArmed(false)}>
        {null}
      </RowAction>
    </span>
  ) : (
    <RowAction label="Delete" danger onClick={() => setArmed(true)}>
      <Trash2 className="size-3" aria-hidden />
    </RowAction>
  );
}

function ScheduleRow({
  schedule,
  onSetScheduleActive,
  onRunScheduleNow,
  onDeleteSchedule,
}: { schedule: ScheduleDTO } & TasksPanelProps) {
  const Icon = schedule.kind === "report" ? CalendarClock : BellRing;
  const last = schedule.lastRun;
  const pending = last && (last.status === "queued" || last.status === "claimed" || last.status === "running");
  // A one-off that has run: nothing to pause or resume.
  const finished = !schedule.active && !schedule.nextRunAt && schedule.lastRunAt !== null;

  return (
    <li className={cn("rounded-md px-2 py-2 hover:bg-paper", !schedule.active && !pending && "opacity-70")}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-ledger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink" title={schedule.prompt}>
            {schedule.title}
          </p>
          <p className="text-xs text-ink/80">
            {describeRecurrence(schedule.recurrence)}
            {schedule.kind === "report" && schedule.mode && ` · ${getResponseMode(schedule.mode).label}`}
          </p>
          <p className="text-xs text-slate tabular-nums">
            {pending ? (
              <span className="text-amber">{last.status === "queued" ? "Queued — runs within a minute" : "Running now…"}</span>
            ) : schedule.active && schedule.nextRunAt ? (
              <span title={formatFullDateTime(schedule.nextRunAt)}>Next: {formatDateTime(schedule.nextRunAt)}</span>
            ) : finished ? (
              <span title={formatFullDateTime(schedule.lastRunAt!)}>Ran {formatDateTime(schedule.lastRunAt!)}</span>
            ) : (
              "Paused"
            )}
            {schedule.notifyEmail && (
              <span title={`Also emailed to ${schedule.notifyEmail}`}>
                {" · "}
                <Mail className="inline size-3 align-[-1px]" aria-label="Email" />
              </span>
            )}
          </p>
          {last && last.status === "failed" && (
            <p className="text-xs text-alert" title={last.error ?? undefined}>
              Last run failed {formatDateTime(last.at)}
            </p>
          )}
          <div className="-ml-1.5 mt-1 flex flex-wrap items-center gap-0.5">
            <RowAction label="Run now" onClick={() => onRunScheduleNow(schedule.id)}>
              <Zap className="size-3" aria-hidden />
            </RowAction>
            {schedule.active ? (
              <RowAction label="Pause" onClick={() => onSetScheduleActive(schedule.id, false)}>
                <Pause className="size-3" aria-hidden />
              </RowAction>
            ) : (
              !finished && (
                <RowAction label="Resume" onClick={() => onSetScheduleActive(schedule.id, true)}>
                  <Play className="size-3" aria-hidden />
                </RowAction>
              )
            )}
            <DeleteAction onConfirm={() => onDeleteSchedule(schedule.id)} />
          </div>
        </div>
      </div>
    </li>
  );
}

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "email queued", className: "text-amber" },
  pending: { label: "sending email", className: "text-amber" },
  sent: { label: "emailed", className: "text-ledger" },
  failed: { label: "email failed", className: "text-alert" },
  skipped: { label: "email off", className: "text-slate" },
};

function TaskRow({ task, now, onSetTaskStatus, onDeleteTask }: { task: TaskDTO; now: number } & TasksPanelProps) {
  const done = task.status !== "open";
  const overdue = !done && task.dueAt !== null && new Date(task.dueAt).getTime() < now;
  const email = task.assignmentEmail ? EMAIL_STATUS[task.assignmentEmail] : null;

  return (
    <li className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-paper">
      <button
        type="button"
        onClick={() => onSetTaskStatus(task.id, done ? "open" : "done")}
        aria-label={done ? `Reopen “${task.title}”` : `Mark “${task.title}” as done`}
        title={done ? "Reopen" : "Mark as done"}
        className="mt-px shrink-0 text-slate hover:text-ledger"
      >
        {done ? <CircleCheck className="size-4 text-ledger" aria-hidden /> : <Circle className="size-4" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-ink", done && "text-slate line-through")} title={task.details || undefined}>
          {task.title}
        </p>
        <p className="text-xs text-slate">
          {task.assigneeName ?? "Unassigned"}
          {task.dueAt && (
            <span className={cn("tabular-nums", overdue && "text-alert")} title={formatFullDateTime(task.dueAt)}>
              {" · "}
              {overdue ? "overdue, " : "due "}
              {formatDateTime(task.dueAt)}
            </span>
          )}
          {email && !done && <span className={email.className}> · {email.label}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <DeleteAction onConfirm={() => onDeleteTask(task.id)} compact />
      </div>
    </li>
  );
}
