/**
 * Direct OpenAI backend (AI_BACKEND=openai): the web app itself calls OpenAI
 * and Qdrant. No n8n needed. Same steps as the n8n workflows:
 *
 *   Indexing a file
 *     1. Read the text locally (PDF, Word, Excel, PowerPoint).
 *        Scans and photos: OpenAI's vision model transcribes them page by page.
 *     2. Cut pages into passages, embed them with OpenAI, save to Qdrant.
 *     3. OpenAI writes a 3-sentence digest; the document is marked ready.
 *
 *   Answering a question
 *     1. Embed the question, hybrid-search this workspace's passages in Qdrant.
 *     2. Send the passages + question to OpenAI and stream the answer back
 *        (the chat route turns it into AG-UI events for the browser).
 *     3. The model may instead call a form tool: fill in a form template from
 *        what was said, or draft a new template. That becomes a form card.
 */
import "server-only";
import { after } from "next/server";
import { completeIngestion } from "@/lib/data/documents";
import { env } from "@/lib/env";
import { extractPages } from "@/lib/extract";
import { embed, respond, streamChat } from "./openai/client";
import { attachmentFromToolCall, formRules, formTools } from "./openai/form-tools";
import { BASE_RULES, DIGEST_INSTRUCTIONS, MODE_PROMPTS, TRANSCRIBE_INSTRUCTIONS } from "./openai/prompts";
import { buildPassages, deleteDocumentPoints, hybridSearch, keywordVector, savePoints } from "./openai/search-index";
import type { AiBackend, AnswerRequest, IngestRequest } from "./types";

/** Largest scan/photo sent to OpenAI's vision model (its limit is 50 MB per request). */
const MAX_VISION_FILE_BYTES = 35 * 1024 * 1024;
/** Passages per embeddings request. */
const EMBED_BATCH_SIZE = 64;

// --- Indexing ---------------------------------------------------------------------

/** Ask OpenAI's vision model to transcribe a scan or photo, keeping page numbers. */
async function transcribeWithVision(request: IngestRequest): Promise<{ page: number; content: string }[]> {
  if (request.data.byteLength > MAX_VISION_FILE_BYTES) {
    throw new Error("This scan or photo is too large for OpenAI to read (max 35 MB). Try a smaller or text-based PDF.");
  }
  const base64 = Buffer.from(request.data).toString("base64");
  const fileContent =
    request.mimeType === "application/pdf"
      ? { type: "input_file", filename: request.fileName, file_data: `data:application/pdf;base64,${base64}` }
      : { type: "input_image", image_url: `data:${request.mimeType};base64,${base64}` };

  const text = await respond(
    {
      model: env.OPENAI_MODEL_FAST,
      reasoning: { effort: "low" },
      instructions: TRANSCRIBE_INSTRUCTIONS,
      input: [{ role: "user", content: [fileContent, { type: "input_text", text: "Transcribe every page of this file." }] }],
    },
    AbortSignal.timeout(10 * 60_000),
  );

  // Split on the "=== PAGE n ===" markers.
  const parts = text.split(/^\s*=+\s*PAGE\s+(\d+)\s*=+\s*$/im);
  const pages: { page: number; content: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    pages.push({ page: Number(parts[i]), content: parts[i + 1].trim() });
  }
  if (pages.length === 0 && text.trim()) pages.push({ page: 1, content: text.trim() });
  return pages;
}

async function indexDocument(request: IngestRequest): Promise<void> {
  // 1. Pages of text.
  const extracted = await extractPages(request);
  const pages = extracted.needsVision
    ? await transcribeWithVision(request)
    : extracted.pages.map((content, index) => ({ page: index + 1, content }));

  // 2. Passages → embeddings → Qdrant.
  const passages = buildPassages({
    documentId: request.documentId,
    workspaceId: request.workspaceId,
    fileName: request.fileName,
    mimeType: request.mimeType,
    pages,
  });
  if (passages.length === 0) throw new Error("No readable text was found in this file.");

  for (let i = 0; i < passages.length; i += EMBED_BATCH_SIZE) {
    const batch = passages.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embed(batch.map((passage) => passage.embedText));
    await savePoints(
      batch.map((passage, j) => ({
        id: passage.id,
        vector: { dense: vectors[j], bm25: passage.keywords },
        payload: passage.payload,
      })),
    );
  }

  // 3. Short digest for the document list. A failed digest shouldn't fail the upload.
  const excerpt = pages
    .map((p) => `--- Page ${p.page} ---\n${p.content}`)
    .join("\n\n")
    .slice(0, 12_000);
  const summary = await respond({
    model: env.OPENAI_MODEL_FAST,
    reasoning: { effort: "low" },
    max_output_tokens: 1000,
    instructions: DIGEST_INSTRUCTIONS,
    input: `File: ${request.fileName}\n\n${excerpt}`,
  }).catch((error: unknown) => {
    console.error("[openai-backend] digest failed:", error);
    return "";
  });

  await completeIngestion({
    status: "ready",
    documentId: request.documentId,
    totalChunks: passages.length,
    summary: summary.trim() || null,
    pages,
  });
}

// --- Answering --------------------------------------------------------------------

/** The user message: earlier turns, the workspace's files, the excerpts, the question. */
function buildPrompt(request: AnswerRequest, hits: Awaited<ReturnType<typeof hybridSearch>>): string {
  const excerpts = [...hits]
    // Read in document order: file, then page, then position on the page.
    .sort(
      (a, b) =>
        a.file_name.localeCompare(b.file_name) ||
        a.page_number - b.page_number ||
        a.chunk_index - b.chunk_index,
    )
    .map((hit) => `[${hit.file_name}, p. ${hit.page_number}]\n${hit.text}`)
    .join("\n\n---\n\n");

  const history = request.history
    .slice(-10)
    .map((turn) => `${turn.role === "user" ? "CEO" : "Assistant"}: ${turn.content}`)
    .join("\n\n");

  return [
    history && `Conversation so far:\n${history}`,
    `Documents in this workspace: ${request.documentNames.join(", ") || "(none)"}`,
    `Excerpts from the documents (the most relevant passages, in file and page order):\n\n${
      excerpts || "(no matching passages were found)"
    }`,
    `CEO's question: ${request.question}`,
  ]
    .filter(Boolean)
    .join("\n\n=====\n\n");
}

/**
 * Pick `limit` passages from a longer, best-first list without letting one
 * document crowd out the others: best matches first, but no document gets
 * more than half the places. A comparison or a contradiction check then sees
 * every side, while files that barely match aren't pulled in for the sake of it.
 */
function spreadAcrossDocuments(hits: Awaited<ReturnType<typeof hybridSearch>>, limit: number) {
  const capPerDocument = Math.ceil(limit / 2);
  const perDocument = new Map<string, number>();
  const picked: typeof hits = [];
  const skipped: typeof hits = [];
  for (const hit of hits) {
    if (picked.length >= limit) break;
    const count = perDocument.get(hit.document_id) ?? 0;
    if (count < capPerDocument) {
      picked.push(hit);
      perDocument.set(hit.document_id, count + 1);
    } else {
      skipped.push(hit);
    }
  }
  // Only one or two documents match at all: use the rest of their passages.
  for (const hit of skipped) {
    if (picked.length >= limit) break;
    picked.push(hit);
  }
  return picked;
}

export const openaiBackend: AiBackend = {
  async startIngestion(request) {
    // Runs after the upload response is sent; any failure is recorded on the document.
    after(async () => {
      try {
        await indexDocument(request);
      } catch (error) {
        console.error("[openai-backend] indexing failed:", error);
        await completeIngestion({
          status: "failed",
          documentId: request.documentId,
          error: error instanceof Error ? error.message : "Could not index this file.",
        });
      }
    });
  },

  async removeDocument({ documentId, workspaceId }) {
    await deleteDocumentPoints(documentId, workspaceId);
  },

  async *streamAnswer(request) {
    const mode = MODE_PROMPTS[request.mode] ?? MODE_PROMPTS.brief;

    // Only search when there's something to search; otherwise the model says so.
    let hits: Awaited<ReturnType<typeof hybridSearch>> = [];
    if (request.documentNames.length > 0) {
      const [dense] = await embed([request.question]);
      hits = await hybridSearch({
        workspaceId: request.workspaceId,
        dense,
        keywords: keywordVector(request.question),
        limit: mode.spreadAcrossDocuments ? mode.passages * 3 : mode.passages,
      });
      hits = mode.spreadAcrossDocuments ? spreadAcrossDocuments(hits, mode.passages) : hits;
    }

    const templates = request.formTemplates;
    let wroteText = false;
    let card: ReturnType<typeof attachmentFromToolCall> = null;
    for await (const part of streamChat({
      model: mode.deep ? env.OPENAI_MODEL_DEEP : env.OPENAI_MODEL,
      reasoningEffort: mode.deep ? "medium" : "low",
      system: `${BASE_RULES}\n\n${mode.instructions}\n\n${formRules(templates, new Date())}`,
      user: buildPrompt(request, hits),
      tools: formTools(templates),
      signal: request.signal,
    })) {
      if (part.type === "text") {
        wroteText = true;
        yield part.text;
      } else {
        card ??= attachmentFromToolCall(part, templates); // one form card per answer
      }
    }

    if (card) {
      if (!wroteText) yield card.text; // the model only called the tool: explain the card
      yield { form: card.form };
    } else if (!wroteText) {
      // A tool call that couldn't be used, and no text: say so instead of an empty answer.
      yield "I couldn't prepare that form from the request. Please say which form and the details again.";
    }
  },
};
