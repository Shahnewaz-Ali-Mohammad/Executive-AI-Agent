/**
 * The real AI backend: hands all AI work to n8n (which uses OpenAI).
 *
 *   ingest  → the file is read locally (see lib/extract), then
 *             POST {N8N}/webhook/ingest           (JSON: page texts + ids;
 *             the file itself only for scans/photos OpenAI must read)
 *             n8n replies at once, then later calls /api/internal/ingest-callback
 *   delete  → POST {N8N}/webhook/delete-document  (JSON)
 *   answer  → POST {N8N}/webhook/chat             (JSON, streamed reply)
 *
 * Every request carries the shared secret in the `x-webhook-secret` header;
 * the n8n workflows reject requests without it.
 */
import "server-only";
import { after } from "next/server";
import { completeIngestion } from "@/lib/data/documents";
import { env } from "@/lib/env";
import { extractPages } from "@/lib/extract";
import type { AiBackend, AnswerRequest, IngestRequest } from "./types";

const SECRET_HEADER = "x-webhook-secret";

/** Largest scan/photo sent to OpenAI's vision model (its limit is 50 MB per request). */
const MAX_VISION_FILE_BYTES = 35 * 1024 * 1024;

function webhookUrl(path: string): string {
  return `${env.N8N_BASE_URL.replace(/\/$/, "")}/webhook/${path}`;
}

/**
 * fetch() to n8n, but with a clear message when n8n isn't running at all
 * (Node only says "fetch failed" in that case).
 */
async function callN8n(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(
      `Can't reach n8n at ${env.N8N_BASE_URL}. Make sure the n8n container is running ` +
        "(`docker compose up -d` in the executive-agent folder) and that http://localhost:5678 opens in your browser.",
    );
  }
}

/** Turn a failed n8n response into a readable error. */
async function n8nError(response: Response, action: string): Promise<Error> {
  const body = (await response.text().catch(() => "")).slice(0, 300);
  const hint =
    response.status === 404
      ? " Is the workflow imported and published (active) in n8n?"
      : "";
  return new Error(`n8n ${action} failed (HTTP ${response.status}).${hint} ${body}`.trim());
}

/**
 * n8n streams its answer as a sequence of JSON objects, e.g.
 *   {"type":"begin",...}{"type":"item","content":"Rev"}{"type":"item","content":"enue"}{"type":"end",...}
 * usually one per line, but not guaranteed. This splits the byte stream into
 * complete JSON objects by tracking braces (and ignoring braces inside strings).
 */
async function* readJsonObjects(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let consumedUpTo = 0;
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          const text = buffer.slice(start, i + 1);
          consumedUpTo = i + 1;
          start = -1;
          try {
            yield JSON.parse(text);
          } catch {
            // Not valid JSON on its own — ignore it.
          }
        }
      }
    }

    // Keep only the unfinished part for the next chunk.
    buffer = buffer.slice(consumedUpTo);
    if (start !== -1) start -= consumedUpTo;
  }
}

/** Pick the answer text out of a non-streaming n8n JSON reply. */
function extractOutput(payload: unknown): string {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    for (const key of ["output", "text", "answer", "content"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return "";
}

/** Read the file locally, then hand the pages (or the scan) to the n8n ingest workflow. */
async function sendForIndexing(request: IngestRequest): Promise<void> {
  const { pages, needsVision } = await extractPages(request);

  if (needsVision && request.data.byteLength > MAX_VISION_FILE_BYTES) {
    throw new Error("This scan or photo is too large for OpenAI to read (max 35 MB). Try a smaller or text-based PDF.");
  }
  if (!needsVision && pages.every((page) => !page.trim())) {
    throw new Error("No readable text was found in this file.");
  }

  const response = await callN8n(webhookUrl("ingest"), {
    method: "POST",
    headers: { "content-type": "application/json", [SECRET_HEADER]: env.N8N_SHARED_SECRET },
    body: JSON.stringify({
      document_id: request.documentId,
      workspace_id: request.workspaceId,
      file_name: request.fileName,
      mime_type: request.mimeType,
      callback_url: `${env.APP_INTERNAL_URL.replace(/\/$/, "")}/api/internal/ingest-callback`,
      pages: pages.map((content, index) => ({ page: index + 1, content })),
      // Scans and photos: OpenAI's vision model reads the file itself.
      needs_vision: needsVision,
      file_base64: needsVision ? Buffer.from(request.data).toString("base64") : null,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw await n8nError(response, "ingest");
}

export const n8nBackend: AiBackend = {
  async startIngestion(request: IngestRequest) {
    // Reading a long PDF can take a few seconds: do it after the upload
    // response is sent, and record any failure on the document.
    after(async () => {
      try {
        await sendForIndexing(request);
      } catch (error) {
        console.error("[n8n-backend] could not start indexing:", error);
        await completeIngestion({
          status: "failed",
          documentId: request.documentId,
          error: error instanceof Error ? error.message : "Could not start indexing.",
        });
      }
    });
  },

  async removeDocument({ documentId, workspaceId }) {
    const response = await callN8n(webhookUrl("delete-document"), {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: env.N8N_SHARED_SECRET },
      body: JSON.stringify({ document_id: documentId, workspace_id: workspaceId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw await n8nError(response, "delete");
  },

  async *streamAnswer(request: AnswerRequest) {
    const response = await callN8n(webhookUrl("chat"), {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: env.N8N_SHARED_SECRET },
      body: JSON.stringify({
        question: request.question,
        mode: request.mode,
        workspace_id: request.workspaceId,
        history: request.history,
        document_names: request.documentNames,
      }),
      signal: request.signal,
    });
    if (!response.ok || !response.body) throw await n8nError(response, "chat");

    // n8n replies with JSON objects either way (always labelled application/json):
    //  - streaming workflow: {"type":"begin"} {"type":"item","content":"…"} … {"type":"end"}
    //  - non-streaming workflow: one object such as {"output":"the whole answer"}
    for await (const event of readJsonObjects(response.body)) {
      if (!event || typeof event !== "object") continue;
      const { type, content, metadata } = event as {
        type?: string;
        content?: unknown;
        metadata?: { nodeName?: string };
      };

      if (type === "item") {
        if (typeof content === "string") yield content;
      } else if (type === "error") {
        const step = metadata?.nodeName ? ` at step "${metadata.nodeName}"` : "";
        const detail = typeof content === "string" && content ? `: ${content}` : "";
        throw new Error(`The n8n chat workflow failed${step}${detail}. See Executions in n8n for details.`);
      } else if (type === undefined) {
        const text = extractOutput(event);
        if (text) yield text;
      }
      // "begin" / "end" markers need no action.
    }
  },
};
