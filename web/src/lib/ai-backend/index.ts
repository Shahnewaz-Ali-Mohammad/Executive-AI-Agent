/**
 * Picks the AI backend based on AI_BACKEND in .env:
 *   openai → the web app calls OpenAI + Qdrant directly
 *   n8n    → the same pipeline, run as n8n workflows
 *   mock   → no AI keys needed (keyword matching only)
 * Route handlers import `aiBackend` from here and never care which one it is.
 */
import "server-only";
import { env } from "@/lib/env";
import { mockBackend } from "./mock-backend";
import { n8nBackend } from "./n8n-backend";
import { openaiBackend } from "./openai-backend";
import type { AiBackend } from "./types";

/** Decided per call (not at import), so the app can be built without a .env. */
function current(): AiBackend {
  switch (env.AI_BACKEND) {
    case "openai":
      return openaiBackend;
    case "n8n":
      return n8nBackend;
    default:
      return mockBackend;
  }
}

export const aiBackend: AiBackend = {
  startIngestion: (request) => current().startIngestion(request),
  removeDocument: (input) => current().removeDocument(input),
  streamAnswer: (request) => current().streamAnswer(request),
};

export type { AiBackend, AnswerRequest, ChatTurn, IngestRequest, IngestionResult } from "./types";
