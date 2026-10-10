/**
 * Chat message data access. Every message belongs to one saved conversation.
 */
import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Citation } from "@/lib/citations";
import type { FormAttachment } from "@/lib/forms";
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
    form: row.form ?? null,
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
  form?: FormAttachment | null;
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
      form: input.form ?? null,
    })
    // The browser may retry a run with the same message id; keep the first copy.
    .onConflictDoNothing();

  // Move the conversation to the top; the first question becomes its title.
  await touchConversation(input.conversationId, input.role === "user" ? input.content : undefined);
}
