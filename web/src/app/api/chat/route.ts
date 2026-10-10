/**
 * POST /api/chat — the AG-UI endpoint the chat screen talks to.
 *
 * Request:  a standard AG-UI `RunAgentInput` (threadId, runId, messages, …).
 *           Our own fields travel in `forwardedProps`: { workspaceId, conversationId, mode }.
 * Response: an SSE stream of AG-UI events:
 *
 *   RUN_STARTED
 *   STEP_STARTED  "reading_documents"      ← UI shows "Reading your documents…"
 *   STEP_FINISHED "reading_documents"      ← when the first words arrive
 *   TEXT_MESSAGE_START / CONTENT… / END    ← the answer, streamed
 *   CUSTOM "citations"                     ← citations resolved to document ids
 *   RUN_FINISHED                           (or RUN_ERROR if anything fails)
 *
 * This route is the "translator": the AI backend (n8n or mock) just yields
 * plain text, and this route wraps it in AG-UI events and saves the chat.
 */
import { contentToText, EventType, type BaseEvent } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import type { NextRequest } from "next/server";
import { agUiResponse } from "@/lib/ag-ui/event-stream";
import { aiBackend, type ChatTurn } from "@/lib/ai-backend";
import { extractCitations } from "@/lib/citations";
import { requireConversation } from "@/lib/data/conversations";
import { listCitableDocuments } from "@/lib/data/documents";
import { saveMessage } from "@/lib/data/messages";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";
import { DEFAULT_RESPONSE_MODE, isResponseMode } from "@/lib/response-modes";
import { CITATIONS_EVENT, type CitationsEventValue } from "@/lib/types";

/** How much earlier conversation is sent along with each question. */
const HISTORY_TURNS = 10;
const HISTORY_CHARS_PER_TURN = 4000;

const STEP_READING = "reading_documents";

export async function POST(request: NextRequest) {
  try {
    // 1. Validate the AG-UI input and our forwarded props.
    const parsed = RunAgentInputSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid AG-UI request body.");
    const input = parsed.data;

    const props = (input.forwardedProps ?? {}) as Record<string, unknown>;
    const workspaceId = typeof props.workspaceId === "string" ? props.workspaceId : "";
    const conversationId = typeof props.conversationId === "string" ? props.conversationId : "";
    const mode = isResponseMode(props.mode) ? props.mode : DEFAULT_RESPONSE_MODE;
    await requireWorkspace(workspaceId);
    // The conversation must exist and belong to this workspace.
    await requireConversation(conversationId, workspaceId);

    // 2. The last message is the new question; the ones before it are history.
    const textMessages = input.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        id: message.id,
        role: message.role as ChatTurn["role"],
        content: contentToText(message.content as Parameters<typeof contentToText>[0]).trim(),
      }))
      .filter((message) => message.content.length > 0);

    const question = textMessages.at(-1);
    if (!question || question.role !== "user") {
      throw new HttpError(400, "The last message must be the user's question.");
    }
    const history: ChatTurn[] = textMessages.slice(0, -1).slice(-HISTORY_TURNS).map((message) => ({
      role: message.role,
      content: message.content.slice(0, HISTORY_CHARS_PER_TURN),
    }));

    const documents = await listCitableDocuments(workspaceId);
    await saveMessage({ id: question.id, workspaceId, conversationId, role: "user", content: question.content, mode });

    // 3. Stream the answer as AG-UI events.
    return agUiResponse(request, async (emit, signal) => {
      const { threadId, runId } = input;
      const messageId = crypto.randomUUID();

      emit({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
      emit({ type: EventType.STEP_STARTED, stepName: STEP_READING } as BaseEvent);

      let answer = "";
      let started = false;
      for await (const delta of aiBackend.streamAnswer({
        workspaceId,
        question: question.content,
        mode,
        history,
        documentNames: documents.map((doc) => doc.fileName),
        signal,
      })) {
        if (!delta) continue;
        if (!started) {
          started = true;
          emit({ type: EventType.STEP_FINISHED, stepName: STEP_READING } as BaseEvent);
          emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" } as BaseEvent);
        }
        answer += delta;
        emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta } as BaseEvent);
      }

      if (!started) throw new Error("The assistant returned an empty answer.");
      emit({ type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent);

      // 4. Resolve "[File, p. X]" references to documents and tell the UI.
      const citations = extractCitations(answer, documents);
      emit({
        type: EventType.CUSTOM,
        name: CITATIONS_EVENT,
        value: { messageId, citations } satisfies CitationsEventValue,
      } as BaseEvent);

      await saveMessage({
        id: messageId,
        workspaceId,
        conversationId,
        role: "assistant",
        content: answer,
        mode,
        citations,
      });
      emit({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
