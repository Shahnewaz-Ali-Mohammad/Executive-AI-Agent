/**
 * The automation engine behind n8n's scheduler workflow.
 *
 * n8n owns the clock and the delivery; the app owns the data and the AI:
 *
 *   every minute, n8n → POST /api/internal/automation/due
 *       claimDueRuns(): records the heartbeat, queues what has fallen due
 *       (schedules whose time has come, tasks past their deadline) and hands
 *       n8n the queued runs, each claimed exactly once (row locks with
 *       SKIP LOCKED, so overlapping executions never pick the same run).
 *
 *   for each run, n8n → POST /api/internal/automation/runs/:id/execute
 *       executeRun(): writes the report (or reminder), stores it as a
 *       notification, and returns the email to send, if any.
 *
 *   n8n sends the email through its SMTP account (when one is set up), then
 *       → POST /api/internal/automation/runs/:id/delivered
 *       recordDelivery(): notes whether the email went out.
 *
 * Runs that were claimed but never finished (n8n restarted mid-run) are
 * marked failed after RUN_TIMEOUT_MINUTES, so nothing stays "running" forever.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { aiBackend } from "@/lib/ai-backend";
import { extractCitations } from "@/lib/citations";
import { db, schema } from "@/lib/db";
import { buildEmail, type EmailMessage } from "@/lib/email";
import { HttpError, isUuid } from "@/lib/http";
import { DEFAULT_RESPONSE_MODE, getResponseMode, isResponseMode } from "@/lib/response-modes";
import { nextOccurrence } from "@/lib/schedule";
import type { SchedulerStatusDTO } from "@/lib/types";
import { listCitableDocuments } from "./documents";
import { createNotification } from "./notifications";

const { schedules, tasks, automationRuns, appSettings, workspaces } = schema;

/** Most runs handed to n8n per check (the rest wait for the next minute). */
const CLAIM_BATCH = 10;
/** A claimed run that hasn't finished after this long is marked failed. */
const RUN_TIMEOUT_MINUTES = 15;
/** Longest a single report may take. */
const REPORT_TIMEOUT_MS = 8 * 60_000;
/** The scheduler counts as healthy if it checked in this recently. */
const HEARTBEAT_HEALTHY_MS = 3 * 60_000;

const HEARTBEAT_KEY = "scheduler";

interface Heartbeat {
  lastCheckAt: string;
  emailEnabled: boolean;
}

export interface ClaimedRun {
  runId: string;
  type: string;
  title: string;
}

/** What n8n gets back from /execute. */
export interface RunOutcome {
  runId: string;
  status: "succeeded" | "failed";
  title: string;
  /** An email for n8n to send, or null. */
  email: EmailMessage | null;
}

// --- Heartbeat ---------------------------------------------------------------------

async function recordHeartbeat(emailEnabled: boolean): Promise<void> {
  const value: Heartbeat = { lastCheckAt: new Date().toISOString(), emailEnabled };
  await db
    .insert(appSettings)
    .values({ key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getSchedulerStatus(): Promise<SchedulerStatusDTO> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, HEARTBEAT_KEY));
  const beat = row?.value as Heartbeat | undefined;
  const last = beat?.lastCheckAt ? new Date(beat.lastCheckAt) : null;
  return {
    lastCheckAt: last?.toISOString() ?? null,
    healthy: Boolean(last && Date.now() - last.getTime() < HEARTBEAT_HEALTHY_MS),
    emailEnabled: Boolean(beat?.emailEnabled),
  };
}

// --- Claiming ------------------------------------------------------------------------

/** Called by n8n every minute. */
export async function claimDueRuns(options: { emailEnabled: boolean }): Promise<ClaimedRun[]> {
  const now = new Date();
  await recordHeartbeat(options.emailEnabled);

  return db.transaction(async (tx) => {
    // 1. Give up on runs that never finished.
    await tx
      .update(automationRuns)
      .set({ status: "failed", finishedAt: now, error: "Didn't finish in time (the scheduler may have restarted)." })
      .where(
        and(
          inArray(automationRuns.status, ["claimed", "running"]),
          lt(automationRuns.startedAt, new Date(now.getTime() - RUN_TIMEOUT_MINUTES * 60_000)),
        ),
      );

    // 2. Schedules whose time has come → queue a run, move to the next time.
    //    If the scheduler was down, a missed schedule runs once, not once per missed slot.
    const dueSchedules = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.active, true), lte(schedules.nextRunAt, now)))
      .for("update", { skipLocked: true });
    for (const s of dueSchedules) {
      const next = nextOccurrence(s.recurrence, s.timeZone, now);
      await tx.insert(automationRuns).values({
        workspaceId: s.workspaceId,
        scheduleId: s.id,
        type: s.kind,
        scheduledFor: s.nextRunAt,
      });
      await tx
        .update(schedules)
        .set({ nextRunAt: next, active: next !== null, lastRunAt: now, updatedAt: now })
        .where(eq(schedules.id, s.id));
    }

    // 3. Open tasks past their deadline → one "task due" run each.
    const dueTasks = await tx
      .select({ id: tasks.id, workspaceId: tasks.workspaceId, dueAt: tasks.dueAt })
      .from(tasks)
      .where(and(eq(tasks.status, "open"), lte(tasks.dueAt, now), isNull(tasks.dueNotifiedAt)))
      .for("update", { skipLocked: true });
    for (const t of dueTasks) {
      await tx.insert(automationRuns).values({ workspaceId: t.workspaceId, taskId: t.id, type: "task_due", scheduledFor: t.dueAt });
      await tx.update(tasks).set({ dueNotifiedAt: now }).where(eq(tasks.id, t.id));
    }

    // 4. Hand over queued runs, oldest first, each to exactly one caller.
    const queued = await tx
      .select({ id: automationRuns.id })
      .from(automationRuns)
      .where(eq(automationRuns.status, "queued"))
      .orderBy(asc(automationRuns.startedAt))
      .limit(CLAIM_BATCH)
      .for("update", { skipLocked: true });
    if (queued.length === 0) return [];

    const claimed = await tx
      .update(automationRuns)
      .set({ status: "claimed", startedAt: now })
      .where(inArray(automationRuns.id, queued.map((r) => r.id)))
      .returning();

    const titles = await runTitles(tx, claimed);
    return claimed.map((run) => ({ runId: run.id, type: run.type, title: titles.get(run.id) ?? run.type }));
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function runTitles(tx: Tx, runs: schema.AutomationRun[]): Promise<Map<string, string>> {
  const scheduleIds = runs.flatMap((r) => (r.scheduleId ? [r.scheduleId] : []));
  const taskIds = runs.flatMap((r) => (r.taskId ? [r.taskId] : []));
  const [s, t] = await Promise.all([
    scheduleIds.length ? tx.select({ id: schedules.id, title: schedules.title }).from(schedules).where(inArray(schedules.id, scheduleIds)) : [],
    taskIds.length ? tx.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)) : [],
  ]);
  const byId = new Map([...s, ...t].map((x) => [x.id, x.title]));
  return new Map(runs.map((r) => [r.id, byId.get(r.scheduleId ?? r.taskId ?? "") ?? r.type]));
}

// --- Executing -----------------------------------------------------------------------

function formatWhen(date: Date, timeZone: string): string {
  return date.toLocaleString("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Called by n8n for each claimed run. Never throws for AI failures: they become a failed run + notification. */
export async function executeRun(runId: string): Promise<RunOutcome> {
  if (!isUuid(runId)) throw new HttpError(404, "Run not found.");
  // Only a claimed run can start, and only once.
  const [run] = await db
    .update(automationRuns)
    .set({ status: "running" })
    .where(and(eq(automationRuns.id, runId), eq(automationRuns.status, "claimed")))
    .returning();
  if (!run) {
    const [existing] = await db.select({ status: automationRuns.status }).from(automationRuns).where(eq(automationRuns.id, runId));
    if (!existing) throw new HttpError(404, "Run not found.");
    throw new HttpError(409, `This run is already ${existing.status}.`);
  }

  try {
    const outcome = await perform(run);
    await db
      .update(automationRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        notificationId: outcome.notificationId,
        delivery: outcome.email ? { email: "pending" } : { email: "none" },
      })
      .where(eq(automationRuns.id, run.id));
    return { runId: run.id, status: "succeeded", title: outcome.title, email: outcome.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[automation] run ${run.id} (${run.type}) failed:`, error);
    const title = await titleOf(run);
    const notification = await createNotification({
      workspaceId: run.workspaceId,
      kind: "error",
      title: `Couldn't run “${title}”`,
      body: `The ${run.type.replace("_", " ")} failed: ${message}\n\nIt will run again at its next scheduled time. You can also use **Run now** in the Tasks tab.`,
      scheduleId: run.scheduleId,
      taskId: run.taskId,
      runId: run.id,
    });
    await db
      .update(automationRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message.slice(0, 1000), notificationId: notification.id })
      .where(eq(automationRuns.id, run.id));
    return { runId: run.id, status: "failed", title, email: null };
  }
}

async function titleOf(run: schema.AutomationRun): Promise<string> {
  if (run.scheduleId) {
    const [s] = await db.select({ title: schedules.title }).from(schedules).where(eq(schedules.id, run.scheduleId));
    if (s) return s.title;
  }
  if (run.taskId) {
    const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, run.taskId));
    if (t) return t.title;
  }
  return run.type;
}

async function perform(run: schema.AutomationRun): Promise<{ title: string; notificationId: string | null; email: EmailMessage | null }> {
  const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, run.workspaceId));
  const workspaceName = workspace?.name ?? "Workspace";

  // --- Scheduled report or reminder ---
  if (run.type === "report" || run.type === "reminder") {
    if (!run.scheduleId) throw new Error("The schedule was deleted.");
    const [s] = await db.select().from(schedules).where(eq(schedules.id, run.scheduleId));
    if (!s) throw new Error("The schedule was deleted.");
    await db.update(schedules).set({ lastRunAt: new Date() }).where(eq(schedules.id, s.id));
    const when = formatWhen(new Date(), s.timeZone);

    if (s.kind === "reminder") {
      const notification = await createNotification({
        workspaceId: s.workspaceId,
        kind: "reminder",
        title: s.title,
        body: s.prompt,
        scheduleId: s.id,
        runId: run.id,
      });
      const email = s.notifyEmail
        ? buildEmail({ to: s.notifyEmail, subject: `Reminder: ${s.title}`, heading: s.title, markdown: s.prompt, footer: `${workspaceName} · ${when}` })
        : null;
      return { title: s.title, notificationId: notification.id, email };
    }

    // Report: the same answer pipeline as the chat, without tools or history.
    const mode = isResponseMode(s.mode) ? s.mode : DEFAULT_RESPONSE_MODE;
    const documents = await listCitableDocuments(s.workspaceId);
    let answer = "";
    for await (const chunk of aiBackend.streamAnswer({
      workspaceId: s.workspaceId,
      question: s.prompt,
      mode,
      history: [],
      documentNames: documents.map((d) => d.fileName),
      formTemplates: [],
      actions: false,
      timeZone: s.timeZone,
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    })) {
      if (typeof chunk === "string") answer += chunk;
    }
    answer = answer.trim();
    if (!answer) throw new Error("The assistant returned an empty report.");

    const citations = extractCitations(answer, documents);
    const notification = await createNotification({
      workspaceId: s.workspaceId,
      kind: "report",
      title: s.title,
      body: answer,
      citations,
      mode,
      scheduleId: s.id,
      runId: run.id,
    });
    const email = s.notifyEmail
      ? buildEmail({
          to: s.notifyEmail,
          subject: `${s.title} — ${when}`,
          heading: s.title,
          markdown: answer,
          footer: `${workspaceName} · ${getResponseMode(mode).label} · ${when}`,
        })
      : null;
    return { title: s.title, notificationId: notification.id, email };
  }

  // --- Tasks ---
  if (run.type === "task_assigned" || run.type === "task_due") {
    if (!run.taskId) throw new Error("The task was deleted.");
    const [t] = await db.select().from(tasks).where(eq(tasks.id, run.taskId));
    if (!t) throw new Error("The task was deleted.");
    const due = t.dueAt ? formatWhen(t.dueAt, t.timeZone) : null;
    const greeting = t.assigneeName ? `Hi ${t.assigneeName},` : "Hello,";
    const details = t.details ? `\n\n${t.details}` : "";

    if (run.type === "task_assigned") {
      if (!t.assigneeEmail || t.status !== "open") return { title: t.title, notificationId: null, email: null };
      return {
        title: t.title,
        notificationId: null, // the CEO created it; nothing new to tell them
        email: buildEmail({
          to: t.assigneeEmail,
          subject: `New task: ${t.title}`,
          heading: t.title,
          markdown: `${greeting}\n\nYou've been asked to take care of this task.${details}${due ? `\n\n**Due:** ${due}` : ""}`,
          footer: workspaceName,
        }),
      };
    }

    // task_due: tell the CEO, and remind the assignee.
    if (t.status !== "open") return { title: t.title, notificationId: null, email: null };
    const who = t.assigneeName ? ` (${t.assigneeName})` : "";
    const notification = await createNotification({
      workspaceId: t.workspaceId,
      kind: "task_due",
      title: `Due now: ${t.title}${who}`,
      body: `**${t.title}** is due${t.assigneeName ? ` — assigned to ${t.assigneeName}` : ""}.${details}\n\nMark it done in the Tasks tab when it's finished.`,
      taskId: t.id,
      runId: run.id,
    });
    const email = t.assigneeEmail
      ? buildEmail({
          to: t.assigneeEmail,
          subject: `Reminder: “${t.title}” is due`,
          heading: `Due now: ${t.title}`,
          markdown: `${greeting}\n\nA reminder that this task is due.${details}`,
          footer: workspaceName,
        })
      : null;
    return { title: t.title, notificationId: notification.id, email };
  }

  throw new Error(`Unknown run type "${run.type}".`);
}

// --- Delivery ----------------------------------------------------------------------------

/** n8n reports whether the email went out: sent | failed | skipped (no SMTP set up). */
export async function recordDelivery(runId: string, input: { email: "sent" | "failed" | "skipped"; error?: string | null }) {
  if (!isUuid(runId)) throw new HttpError(404, "Run not found.");
  const [run] = await db
    .update(automationRuns)
    .set({ delivery: sql`coalesce(${automationRuns.delivery}, '{}'::jsonb) || ${JSON.stringify({ email: input.email })}::jsonb` })
    .where(eq(automationRuns.id, runId))
    .returning();
  if (!run) throw new HttpError(404, "Run not found.");

  if (input.email === "failed") {
    const title = await titleOf(run);
    await createNotification({
      workspaceId: run.workspaceId,
      kind: "error",
      title: `Email not sent: “${title}”`,
      body: `n8n couldn't send the email${input.error ? `: ${input.error}` : "."}\n\nCheck the SMTP settings in .env (SMTP_HOST, SMTP_USER …) and restart n8n.`,
      scheduleId: run.scheduleId,
      taskId: run.taskId,
      runId: run.id,
    });
  }
}
