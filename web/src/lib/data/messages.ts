/**
 * Chat message data access. Every message belongs to one saved conversation.
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Citation } from "@/lib/citations";
import type { ChatCard } from "@/lib/cards";
import { db, schema } from "@/lib/db";
import { isResponseMode, type ResponseModeId } from "@/lib/response-modes";
import type { ChatMessageDTO } from "@/lib/types";
import { touchConversation } from "./conversations";

const { chatMessages } = schema;

function toDTO(row: schema.ChatMessageRecord): ChatMessageDTO {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    mode: isResponseMode(row.mode) ? row.mode : null,
    citations: row.citations ?? [],
    card: row.card ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMessages(conversationId: string): Promise<ChatMessageDTO[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt));
  return rows.map(toDTO);
}

export async function saveMessage(input: {
  id: string;
  workspaceId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  mode?: ResponseModeId;
  citations?: Citation[];
  card?: ChatCard | null;
}): Promise<void> {
  await db
    .insert(chatMessages)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      mode: input.mode ?? null,
      citations: input.citations ?? null,
      card: input.card ?? null,
    })
    // The browser may retry a run with the same message id; keep the first copy.
    .onConflictDoNothing();

  // Move the conversation to the top; the first question becomes its title.
  await touchConversation(input.conversationId, input.role === "user" ? input.content : undefined);
}

/**
 * After a card is confirmed (form saved, task created …), record that on its
 * chat message, so reopening the conversation shows it as done.
 */
export async function updateMessageCard(
  messageId: string,
  workspaceId: string,
  update: (card: ChatCard) => ChatCard,
): Promise<void> {
  const [row] = await db
    .select({ card: chatMessages.card })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.workspaceId, workspaceId)));
  if (!row?.card) return; // not a card message in this workspace: nothing to update
  await db.update(chatMessages).set({ card: update(row.card) }).where(eq(chatMessages.id, messageId));
}
