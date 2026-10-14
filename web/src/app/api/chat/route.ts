/**
 * POST /api/chat — the AG-UI endpoint the chat screen talks to.
 *
 * Request:  a standard AG-UI `RunAgentInput` (threadId, runId, messages, …).
 *           Our own fields travel in `forwardedProps`: { workspaceId, conversationId, mode, timeZone }.
 * Response: an SSE stream of AG-UI events:
 *
 *   RUN_STARTED
 *   STEP_STARTED  "reading_documents"      ← UI shows "Reading your documents…"
 *   STEP_FINISHED "reading_documents"      ← when the first words arrive
 *   TEXT_MESSAGE_START / CONTENT… / END    ← the answer, streamed
 *   CUSTOM "citations"                     ← citations resolved to document ids
 *   CUSTOM "card"                          ← only when the answer carries a card (form, task, schedule)
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
import { listTemplates } from "@/lib/data/forms";
import { listMessages, saveMessage } from "@/lib/data/messages";
import { describeCard, type ChatCard } from "@/lib/cards";
import { requireWorkspace } from "@/lib/data/workspaces";
import { env } from "@/lib/env";
import { handleRouteError, HttpError } from "@/lib/http";
import { safeTimeZone } from "@/lib/schedule";
import { DEFAULT_RESPONSE_MODE, isResponseMode } from "@/lib/response-modes";
import {
  CITATIONS_EVENT,
  CARD_EVENT,
  type CitationsEventValue,
  type ChatMessageDTO,
  type CardEventValue,
} from "@/lib/types";

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
    const timeZone = safeTimeZone(typeof props.timeZone === "string" ? props.timeZone : null, safeTimeZone(env.DEFAULT_TIME_ZONE));
    await requireWorkspace(workspaceId);
    // The conversation must exist and belong to this workspace.
    await requireConversation(conversationId, workspaceId);

    // 2. The last message is the new question.
    const last = input.messages.at(-1);
    const question = last && {
      id: last.id,
      role: last.role,
      content: contentToText(last.content as Parameters<typeof contentToText>[0]).trim(),
    };
    if (!question || question.role !== "user" || !question.content) {
      throw new HttpError(400, "The last message must be the user's question.");
    }

    // History comes from the saved conversation (not the browser), including
    // form cards as short text, so "the department is Finance" can update a
    // form drafted earlier.
    const saved = await listMessages(conversationId);
    const history: ChatTurn[] = saved
      .filter((message) => message.id !== question.id)
      .slice(-HISTORY_TURNS)
      .map((message) => ({ role: message.role, content: historyText(message) }));

    const [documents, formTemplates] = await Promise.all([listCitableDocuments(workspaceId), listTemplates()]);
    await saveMessage({ id: question.id, workspaceId, conversationId, role: "user", content: question.content, mode });

    // 3. Stream the answer as AG-UI events.
    return agUiResponse(request, async (emit, signal) => {
      const { threadId, runId } = input;
      const messageId = crypto.randomUUID();

      emit({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
      emit({ type: EventType.STEP_STARTED, stepName: STEP_READING } as BaseEvent);

      let answer = "";
      let started = false;
      let card: ChatCard | null = null;
      for await (const chunk of aiBackend.streamAnswer({
        workspaceId,
        question: question.content,
        mode,
        history,
        documentNames: documents.map((doc) => doc.fileName),
        formTemplates,
        actions: true,
        timeZone,
        signal,
      })) {
        if (typeof chunk !== "string") {
          card = chunk.card; // shown after the text
          continue;
        }
        const delta = chunk;
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

      if (card) {
        emit({ type: EventType.CUSTOM, name: CARD_EVENT, value: { messageId, card } satisfies CardEventValue } as BaseEvent);
      }

      await saveMessage({
        id: messageId,
        workspaceId,
        conversationId,
        role: "assistant",
        content: answer,
        mode,
        citations,
        card,
      });
      emit({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** A saved message as history text; cards are summarised so the AI can continue them. */
function historyText(message: ChatMessageDTO): string {
  const text = message.content.slice(0, HISTORY_CHARS_PER_TURN);
  return message.card ? `${text}\n${describeCard(message.card)}` : text;
}
