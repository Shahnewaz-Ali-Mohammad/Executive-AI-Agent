/**
 * The contract between the web app and whatever does the AI work.
 *
 * Three implementations exist:
 *  - openai-backend.ts → the web app calls OpenAI + Qdrant directly
 *  - n8n-backend.ts    → the same pipeline as n8n workflows
 *  - mock-backend.ts → runs locally with no AI keys, for trying the UI
 *
 * Route handlers only ever talk to the `AiBackend` interface, so switching
 * between them is a single setting (AI_BACKEND in .env).
 */
import { z } from "zod";
import type { ChatCard } from "@/lib/cards";
import type { ResponseModeId } from "@/lib/response-modes";
import type { FormTemplateDTO } from "@/lib/types";

/** Everything the backend needs to index one uploaded file. */
export interface IngestRequest {
  documentId: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  /** The original file bytes. */
  data: Uint8Array;
}

/** A previous turn of the conversation, sent along for context. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything the backend needs to answer one question. */
export interface AnswerRequest {
  workspaceId: string;
  question: string;
  mode: ResponseModeId;
  /** Earlier messages in this workspace's conversation (oldest first). */
  history: ChatTurn[];
  /** File names in the workspace, so the AI can tell what exists vs. what's missing. */
  documentNames: string[];
  /** Form templates the AI may fill in (or it may draft a new one). */
  formTemplates: FormTemplateDTO[];
  /**
   * Offer the actions (forms, tasks, schedules) as tools. Off for scheduled
   * reports, which only answer.
   */
  actions: boolean;
  /** The CEO's time zone (IANA), for "tomorrow at 9" and "every Monday". */
  timeZone: string;
  /** Fires if the CEO stops the answer or closes the page. */
  signal: AbortSignal;
}

/** A piece of an answer: text, or a card to show with it. */
export type AnswerChunk = string | { card: ChatCard };

export interface AiBackend {
  /**
   * Start indexing a document. Must return quickly: the actual work happens
   * in the background and finishes by calling `completeIngestion`
   * (directly for the mock, via the /api/internal/ingest-callback route for n8n).
   */
  startIngestion(request: IngestRequest): Promise<void>;

  /** Remove a document's chunks from the search index. */
  removeDocument(input: { documentId: string; workspaceId: string }): Promise<void>;

  /**
   * Stream the answer: text pieces in order, and optionally one card (a
   * filled form, a template draft, a task or a schedule) after the text.
   */
  streamAnswer(request: AnswerRequest): AsyncIterable<AnswerChunk>;
}

/**
 * Result of indexing a document. n8n POSTs this to
 * /api/internal/ingest-callback; the schema validates that request.
 */
export const ingestionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    documentId: z.string().uuid(),
    totalChunks: z.number().int().nonnegative(),
    summary: z.string().nullish(),
    pages: z
      .array(
        z.object({
          page: z.number().int().positive(),
          content: z.string(),
        }),
      )
      .default([]),
  }),
  z.object({
    status: z.literal("failed"),
    documentId: z.string().uuid(),
    error: z.string().default("Processing failed."),
  }),
]);

export type IngestionResult = z.infer<typeof ingestionResultSchema>;
