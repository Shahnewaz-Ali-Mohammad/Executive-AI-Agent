/**
 * Saved conversations. Each workspace can hold many; the newest activity
 * comes first in the list.
 */
import "server-only";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError, isUuid } from "@/lib/http";
import type { ConversationDTO } from "@/lib/types";

const { conversations } = schema;

/** Title used until the first question arrives (or the CEO renames it). */
export const DEFAULT_CONVERSATION_TITLE = "New conversation";
const TITLE_MAX_LENGTH = 60;

function toDTO(row: schema.Conversation, messageCount = 0): ConversationDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    messageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A short title from the first question: one line, at most 60 characters. */
export function titleFromQuestion(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (line.length <= TITLE_MAX_LENGTH) return line || DEFAULT_CONVERSATION_TITLE;
  return `${line.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

export async function listConversations(workspaceId: string): Promise<ConversationDTO[]> {
  const rows = await db
    .select({
      ...getTableColumns(conversations),
      // Fully qualified: inside a sub-select a bare "id" would mean chat_messages.id.
      messageCount: sql<number>`(select count(*) from "chat_messages" as m where m."conversation_id" = "conversations"."id")::int`,
    })
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.updatedAt));
  return rows.map(({ messageCount, ...row }) => toDTO(row, messageCount));
}

export async function createConversation(workspaceId: string, title?: string): Promise<ConversationDTO> {
  const [row] = await db
    .insert(conversations)
    .values({ workspaceId, title: title?.trim() || DEFAULT_CONVERSATION_TITLE })
    .returning();
  return toDTO(row);
}

export async function renameConversation(id: string, title: string): Promise<ConversationDTO> {
  await requireConversation(id);
  const [row] = await db.update(conversations).set({ title }).where(eq(conversations.id, id)).returning();
  return toDTO(row);
}

/** Delete a conversation and (via ON DELETE CASCADE) its messages. Documents are untouched. */
export async function deleteConversation(id: string): Promise<void> {
  await requireConversation(id);
  await db.delete(conversations).where(eq(conversations.id, id));
}

/**
 * Record activity: moves the conversation to the top of the list, and names
 * it after the first question if it still has the default title.
 */
export async function touchConversation(id: string, question?: string): Promise<void> {
  const now = new Date();
  await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, id));
  if (question) {
    await db
      .update(conversations)
      .set({ title: titleFromQuestion(question) })
      .where(and(eq(conversations.id, id), eq(conversations.title, DEFAULT_CONVERSATION_TITLE)));
  }
}

/** Load a conversation or throw 404. Optionally check it belongs to a workspace. */
export async function requireConversation(id: string, workspaceId?: string): Promise<ConversationDTO> {
  if (!isUuid(id)) throw new HttpError(404, "Conversation not found.");
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!row || (workspaceId && row.workspaceId !== workspaceId)) {
    throw new HttpError(404, "Conversation not found.");
  }
  return toDTO(row);
}
