/**
 * Mock AI backend — lets you run and demo the whole app with NO AI keys,
 * NO n8n and NO Qdrant (only Postgres is needed).
 *
 *  - Indexing: the same local reader as the real pipeline (PDF, Word, Excel,
 *    PowerPoint, text). Scans and photos get a placeholder page, because
 *    reading them needs OpenAI.
 *  - Answering: simple keyword matching over those pages, returned as a
 *    streamed "briefing" with real [File, p. X] citations, so citations and
 *    the document viewer can be tested end to end.
 *
 * It is NOT intelligent. Switch AI_BACKEND=openai (or n8n) for real answers.
 */
import "server-only";
import { after } from "next/server";
import { completeIngestion, listWorkspacePages } from "@/lib/data/documents";
import { extractPages } from "@/lib/extract";
import { getResponseMode } from "@/lib/response-modes";
import type { AiBackend, AnswerRequest, IngestRequest } from "./types";

const CHUNK_SIZE = 1000; // same as the real pipeline, so chunk counts look realistic

/** Read the file locally (same reader as the real pipeline). Scans and photos get a placeholder. */
async function readPages(request: IngestRequest): Promise<string[]> {
  const { pages, needsVision } = await extractPages(request);
  if (!needsVision) return pages;
  return [
    `(${request.fileName} is a scan or photo. Reading it needs OpenAI's vision model: ` +
      `set AI_BACKEND=openai and OPENAI_API_KEY in .env.)`,
  ];
}

async function ingest(request: IngestRequest): Promise<void> {
  try {
    const pages = await readPages(request);
    const fullText = pages.join("\n\n");
    await completeIngestion({
      status: "ready",
      documentId: request.documentId,
      totalChunks: Math.max(1, Math.ceil(fullText.length / CHUNK_SIZE)),
      summary: fullText
        ? `${fullText.replace(/\s+/g, " ").slice(0, 280).trim()}… (mock digest: first lines of the file)`
        : "No text found in this file.",
      pages: pages.map((content, index) => ({ page: index + 1, content })),
    });
  } catch (error) {
    console.error("[mock-backend] ingestion failed:", error);
    await completeIngestion({
      status: "failed",
      documentId: request.documentId,
      error: error instanceof Error ? error.message : "Could not read this file.",
    });
  }
}

// --- Answering ---------------------------------------------------------------

const STOP_WORDS = new Set(
  "a an and are as at be by did do does for from has have how i in is it its me my of on or our over that the this to us was we were what when where which who why will with you your about tell give show".split(
    " ",
  ),
);

function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((word) => !STOP_WORDS.has(word));
}

/** Score each page by how often the question's keywords appear in it. */
function rankPages(pages: { fileName: string; pageNumber: number; content: string }[], terms: string[]) {
  return pages
    .map((page) => {
      const lower = page.content.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.split(term).length - 1), 0);
      return { ...page, score };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The sentence on a page that mentions the most keywords. */
function bestSentence(content: string, terms: string[]): string {
  const sentences = content.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 20);
  let best = sentences[0] ?? content.slice(0, 200);
  let bestScore = -1;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const score = terms.filter((term) => lower.includes(term)).length;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best.trim().slice(0, 300);
}

async function buildMockAnswer(request: AnswerRequest): Promise<string> {
  const mode = getResponseMode(request.mode);
  const terms = keywords(request.question);
  const pages = await listWorkspacePages(request.workspaceId);
  const top = rankPages(pages, terms).slice(0, 4);

  const lines = [
    `**${mode.label} (mock mode).** This is keyword matching, not AI — set \`AI_BACKEND=openai\` for real analysis.`,
    "",
  ];

  if (pages.length === 0) {
    lines.push("There are no indexed documents in this workspace yet. Upload a PDF to try citations.");
  } else if (top.length === 0) {
    lines.push(`None of the ${request.documentNames.length} document(s) mention: ${terms.join(", ") || "those words"}.`);
    lines.push("", "**Data availability:** no supporting evidence found in this workspace.");
  } else {
    lines.push("**Most relevant passages:**", "");
    for (const page of top) {
      lines.push(`- "${bestSentence(page.content, terms)}" [${page.fileName}, p. ${page.pageNumber}]`);
    }
    const sources = new Set(top.map((page) => page.fileName));
    lines.push(
      "",
      `**Data availability:** matches found in ${sources.size} of ${request.documentNames.length} document(s).`,
    );
  }
  return lines.join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBackend: AiBackend = {
  async startIngestion(request) {
    // Run after the upload response is sent, like the real background pipeline.
    after(() => ingest(request));
  },

  async removeDocument() {
    // Nothing to do: the mock has no search index besides the page rows in Postgres.
  },

  async *streamAnswer(request) {
    const answer = await buildMockAnswer(request);
    // Stream word by word so the UI behaves like it will with a real model.
    for (const piece of answer.match(/\S+\s*/g) ?? []) {
      if (request.signal.aborted) return;
      yield piece;
      await sleep(18);
    }
  },
};
