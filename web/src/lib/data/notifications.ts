/**
 * Notifications: what shows under the bell. Created by automation runs
 * (finished reports, reminders, tasks falling due, failures).
 */
import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError, isUuid } from "@/lib/http";
import { isResponseMode } from "@/lib/response-modes";
import type { NotificationDetailDTO, NotificationDTO, NotificationKind } from "@/lib/types";

const { notifications, workspaces } = schema;

const PREVIEW_CHARS = 200;

/** Markdown → short plain text for the list. */
function preview(markdown: string): string {
  const text = markdown
    .replace(/\s*\[[^\]]+?, p\. ?\d+[^\]]*\]/g, "") // citations
    .replace(/[#*`>|]/g, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])(?=\s|$)/g, "$1")
    .trim();
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text;
}

type Row = schema.Notification & { workspaceName: string };

function toDTO(row: Row): NotificationDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    kind: row.kind as NotificationKind,
    title: row.title,
    preview: preview(row.body),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    taskId: row.taskId,
    scheduleId: row.scheduleId,
  };
}

function selectWithWorkspace() {
  return db
    .select({ notification: notifications, workspaceName: workspaces.name })
    .from(notifications)
    .innerJoin(workspaces, eq(workspaces.id, notifications.workspaceId));
}

/** Newest first, across all workspaces (the CEO has one bell). */
export async function listNotifications(limit = 30): Promise<{ items: NotificationDTO[]; unreadCount: number }> {
  const [rows, [{ count }]] = await Promise.all([
    selectWithWorkspace().orderBy(desc(notifications.createdAt)).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(isNull(notifications.readAt)),
  ]);
  return {
    items: rows.map((r) => toDTO({ ...r.notification, workspaceName: r.workspaceName })),
    unreadCount: count,
  };
}

/** One notification in full; opening it marks it read. */
export async function openNotification(id: string): Promise<NotificationDetailDTO> {
  if (!isUuid(id)) throw new HttpError(404, "Notification not found.");
  const [found] = await selectWithWorkspace().where(eq(notifications.id, id));
  if (!found) throw new HttpError(404, "Notification not found.");
  let row = found.notification;
  if (!row.readAt) {
    [row] = await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id)).returning();
  }
  return {
    ...toDTO({ ...row, workspaceName: found.workspaceName }),
    body: row.body,
    citations: row.citations ?? [],
    mode: isResponseMode(row.mode) ? row.mode : null,
  };
}

/** Mark some (or, with no ids, all) notifications as read. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const valid = ids?.filter(isUuid);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(valid ? and(isNull(notifications.readAt), inArray(notifications.id, valid)) : isNull(notifications.readAt));
}

export async function deleteNotification(id: string): Promise<void> {
  if (!isUuid(id)) throw new HttpError(404, "Notification not found.");
  await db.delete(notifications).where(eq(notifications.id, id));
}

/** Used by the automation runs. */
export async function createNotification(
  values: Omit<typeof notifications.$inferInsert, "id" | "createdAt" | "readAt">,
): Promise<schema.Notification> {
  const [row] = await db.insert(notifications).values(values).returning();
  return row;
}
