/**
 * Tasks the CEO assigns (usually from the chat). A task with an assignee
 * email is announced to them by n8n; when it falls due, n8n reminds them and
 * the CEO gets a notification.
 */
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { taskInputSchema, type TaskInput } from "@/lib/cards";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, isUuid } from "@/lib/http";
import { safeTimeZone, zonedTime } from "@/lib/schedule";
import type { TaskDTO } from "@/lib/types";

const { tasks, automationRuns } = schema;

/** When only a date is given, the task is due at the end of the working day. */
const DEFAULT_DUE_TIME = "17:00";

function toDTO(row: schema.Task, assignmentEmail: string | null = null): TaskDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    title: row.title,
    details: row.details,
    assigneeName: row.assigneeName,
    assigneeEmail: row.assigneeEmail,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    assignmentEmail,
  };
}

/** Email status of each task's "you've been assigned" message. */
async function assignmentEmails(taskIds: string[]): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({ taskId: automationRuns.taskId, status: automationRuns.status, delivery: automationRuns.delivery })
    .from(automationRuns)
    .where(and(inArray(automationRuns.taskId, taskIds), eq(automationRuns.type, "task_assigned")));
  return new Map(
    rows.map((r) => [r.taskId!, r.delivery?.email ?? (r.status === "failed" ? "failed" : "queued")]),
  );
}

/** Open tasks first (soonest due first), then the 50 most recently finished. */
export async function listTasks(workspaceId: string): Promise<TaskDTO[]> {
  const [open, closed] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.status, "open")))
      .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), sql`${tasks.status} <> 'open'`))
      .orderBy(desc(tasks.updatedAt))
      .limit(50),
  ]);
  const rows = [...open, ...closed];
  const emails = await assignmentEmails(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, emails.get(row.id) ?? null));
}

export async function requireTask(id: string): Promise<schema.Task> {
  if (!isUuid(id)) throw new HttpError(404, "Task not found.");
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!row) throw new HttpError(404, "Task not found.");
  return row;
}

export async function createTask(input: {
  workspaceId: string;
  conversationId?: string | null;
  task: TaskInput;
}): Promise<TaskDTO> {
  const parsed = taskInputSchema.safeParse(input.task);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid task.");
  const task = parsed.data;
  const timeZone = safeTimeZone(task.timeZone, safeTimeZone(env.DEFAULT_TIME_ZONE));

  let dueAt: Date | null = null;
  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split("-").map(Number);
    const [hh, mm] = (task.dueTime ?? DEFAULT_DUE_TIME).split(":").map(Number);
    dueAt = zonedTime(y, m, d, hh, mm, timeZone);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId ?? null,
        title: task.title,
        details: task.details ?? "",
        assigneeName: task.assigneeName,
        assigneeEmail: task.assigneeEmail,
        dueAt,
        timeZone,
        // Already overdue when created: don't send a "due" reminder straight away as well.
        dueNotifiedAt: dueAt && dueAt <= new Date() ? new Date() : null,
      })
      .returning();
    // Tell the assignee (n8n's scheduler picks this up within a minute).
    if (row.assigneeEmail) {
      await tx.insert(automationRuns).values({ workspaceId: row.workspaceId, taskId: row.id, type: "task_assigned" });
    }
    return toDTO(row, row.assigneeEmail ? "queued" : null);
  });
}

export async function setTaskStatus(id: string, status: "open" | "done" | "cancelled"): Promise<TaskDTO> {
  await requireTask(id);
  const [row] = await db
    .update(tasks)
    .set({ status, completedAt: status === "open" ? null : new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  const emails = await assignmentEmails([row.id]);
  return toDTO(row, emails.get(row.id) ?? null);
}

export async function deleteTask(id: string): Promise<void> {
  await requireTask(id);
  await db.delete(tasks).where(eq(tasks.id, id));
}
