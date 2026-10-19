/**
 * Scheduled reports and reminders. The app keeps each schedule's next run
 * time; n8n's scheduler asks every minute what is due (see automation.ts).
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { scheduleInputSchema, type ScheduleInput } from "@/lib/cards";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, isUuid } from "@/lib/http";
import { isResponseMode } from "@/lib/response-modes";
import { nextOccurrence, safeTimeZone } from "@/lib/schedule";
import type { LastRunDTO, ScheduleDTO } from "@/lib/types";

const { schedules, automationRuns } = schema;

function toDTO(row: schema.Schedule, lastRun: LastRunDTO | null = null): ScheduleDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    prompt: row.prompt,
    mode: isResponseMode(row.mode) ? row.mode : null,
    recurrence: row.recurrence,
    timeZone: row.timeZone,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    active: row.active,
    notifyEmail: row.notifyEmail,
    createdAt: row.createdAt.toISOString(),
    lastRun,
  };
}

/** The most recent run of each schedule. */
async function lastRuns(scheduleIds: string[]): Promise<Map<string, LastRunDTO>> {
  if (scheduleIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([automationRuns.scheduleId], {
      scheduleId: automationRuns.scheduleId,
      status: automationRuns.status,
      startedAt: automationRuns.startedAt,
      finishedAt: automationRuns.finishedAt,
      error: automationRuns.error,
      notificationId: automationRuns.notificationId,
    })
    .from(automationRuns)
    .where(inArray(automationRuns.scheduleId, scheduleIds))
    .orderBy(automationRuns.scheduleId, desc(automationRuns.startedAt));
  return new Map(
    rows.map((r) => [
      r.scheduleId!,
      {
        status: r.status as LastRunDTO["status"],
        at: (r.finishedAt ?? r.startedAt).toISOString(),
        error: r.error,
        notificationId: r.notificationId,
      },
    ]),
  );
}

export async function listSchedules(workspaceId: string): Promise<ScheduleDTO[]> {
  const rows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.workspaceId, workspaceId))
    .orderBy(desc(schedules.active), desc(schedules.createdAt));
  const runs = await lastRuns(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, runs.get(row.id) ?? null));
}

export async function requireSchedule(id: string): Promise<schema.Schedule> {
  if (!isUuid(id)) throw new HttpError(404, "Schedule not found.");
  const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
  if (!row) throw new HttpError(404, "Schedule not found.");
  return row;
}

export async function getScheduleDTO(id: string): Promise<ScheduleDTO> {
  const row = await requireSchedule(id);
  const runs = await lastRuns([row.id]);
  return toDTO(row, runs.get(row.id) ?? null);
}

export async function createSchedule(input: {
  workspaceId: string;
  conversationId?: string | null;
  schedule: ScheduleInput;
}): Promise<ScheduleDTO> {
  const parsed = scheduleInputSchema.safeParse(input.schedule);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid schedule.");
  const s = parsed.data;
  const timeZone = safeTimeZone(s.timeZone, safeTimeZone(env.DEFAULT_TIME_ZONE));
  const nextRunAt = nextOccurrence(s.recurrence, timeZone, new Date());
  if (!nextRunAt) throw new HttpError(400, "That time has already passed. Pick a time in the future.");

  const [row] = await db
    .insert(schedules)
    .values({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      kind: s.scheduleKind,
      title: s.title,
      prompt: s.prompt,
      mode: s.scheduleKind === "report" ? (s.mode ?? "brief") : null,
      recurrence: s.recurrence,
      timeZone,
      nextRunAt,
      notifyEmail: s.notifyEmail,
    })
    .returning();
  return toDTO(row);
}

/** Pause or resume. Resuming recalculates the next run from now (missed runs are skipped). */
export async function setScheduleActive(id: string, active: boolean): Promise<ScheduleDTO> {
  const existing = await requireSchedule(id);
  let nextRunAt = existing.nextRunAt;
  if (active) {
    nextRunAt = nextOccurrence(existing.recurrence, existing.timeZone, new Date());
    if (!nextRunAt) throw new HttpError(400, "This one-off has already passed. Use “Run now”, or create a new one.");
  }
  await db.update(schedules).set({ active, nextRunAt, updatedAt: new Date() }).where(eq(schedules.id, id));
  return getScheduleDTO(id);
}

/** Queue an extra run straight away (n8n picks it up within a minute). */
export async function runScheduleNow(id: string): Promise<ScheduleDTO> {
  const existing = await requireSchedule(id);
  const [pending] = await db
    .select({ id: automationRuns.id })
    .from(automationRuns)
    .where(and(eq(automationRuns.scheduleId, id), inArray(automationRuns.status, ["queued", "claimed", "running"])));
  if (pending) throw new HttpError(409, "It's already queued or running.");
  await db.insert(automationRuns).values({
    workspaceId: existing.workspaceId,
    scheduleId: existing.id,
    type: existing.kind,
    scheduledFor: new Date(),
  });
  return getScheduleDTO(id);
}

export async function deleteSchedule(id: string): Promise<void> {
  await requireSchedule(id);
  await db.delete(schedules).where(eq(schedules.id, id));
}
