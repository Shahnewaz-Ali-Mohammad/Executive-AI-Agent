/**
 * The search index in Qdrant: cutting pages into passages, keyword vectors,
 * saving, searching (hybrid: meaning + exact words) and deleting.
 *
 * Mirrors the n8n workflows exactly (same passage size, same keyword hashing,
 * same collection), so documents indexed by either backend can be searched
 * by the other.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

// --- Passages -------------------------------------------------------------------

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

/**
 * Cut a page into ~1000-character passages that overlap a little, so a
 * sentence on a boundary is still found. Prefers cutting at paragraph, line,
 * sentence, then word boundaries.
 */
export function splitIntoPassages(text: string): string[] {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const passages: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      for (const separator of ["\n\n", "\n", ". ", " "]) {
        const cut = window.lastIndexOf(separator);
        if (cut > CHUNK_SIZE * 0.5) {
          end = start + cut + separator.length;
          break;
        }
      }
    }
    const passage = clean.slice(start, end).trim();
    if (passage) passages.push(passage);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return passages;
}

// --- Keyword (BM25) vector --------------------------------------------------------

const STOP_WORDS = new Set(
  (
    "a an and are as at be by for from has have in is it its of on or " +
    "that the this to was were will with what which who how why when where do does did"
  ).split(" "),
);

export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * Text → sparse vector of word weights for Qdrant's "bm25" index. Each word
 * becomes a number (FNV-1a hash); its weight grows with how often it appears.
 * Qdrant adds the IDF part (rare words count more).
 * MUST stay identical to the n8n workflows' version.
 */
export function keywordVector(text: string): SparseVector {
  const counts = new Map<number, number>();
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = hash >>> 0;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const indices = [...counts.keys()];
  const values = indices.map((index) => {
    const tf = counts.get(index)!;
    return Number(((tf * 2.2) / (tf + 1.2)).toFixed(4)); // BM25 k1 = 1.2
  });
  return { indices, values };
}

// --- Qdrant calls -----------------------------------------------------------------

export interface PassagePayload {
  text: string;
  file_name: string;
  page_number: number;
  chunk_index: number;
  chunk_on_page: number;
  document_id: string;
  workspace_id: string;
  mime_type: string;
  created_at: string;
}

export interface SearchPoint {
  id: string;
  vector: { dense: number[]; bm25: SparseVector };
  payload: PassagePayload;
}

async function qdrant<T>(method: "PUT" | "POST", path: string, body: unknown): Promise<T> {
  const url = `${env.QDRANT_URL.replace(/\/$/, "")}/collections/${env.QDRANT_COLLECTION}${path}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: JSON.stringify(body) });
  } catch {
    throw new Error(
      `Can't reach the search index (Qdrant) at ${env.QDRANT_URL}. Start it with \`docker compose up -d\` in the executive-agent folder.`,
    );
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Search index error (HTTP ${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

/** Save passages (with their vectors) to the index. */
export async function savePoints(points: SearchPoint[]): Promise<void> {
  await qdrant("PUT", "/points?wait=true", { points });
}

/** Remove every passage of one document. */
export async function deleteDocumentPoints(documentId: string, workspaceId: string): Promise<void> {
  await qdrant("POST", "/points/delete?wait=true", {
    filter: {
      must: [
        { key: "document_id", match: { value: documentId } },
        { key: "workspace_id", match: { value: workspaceId } },
      ],
    },
  });
}

/**
 * Hybrid search inside one workspace: best matches by meaning and by exact
 * words, merged with reciprocal rank fusion.
 */
export async function hybridSearch(options: {
  workspaceId: string;
  dense: number[];
  keywords: SparseVector;
  limit: number;
}): Promise<PassagePayload[]> {
  // Only this workspace's documents can ever be returned.
  const filter = { must: [{ key: "workspace_id", match: { value: options.workspaceId } }] };
  const result = await qdrant<{ result?: { points?: { payload: PassagePayload }[] } }>("POST", "/points/query", {
    prefetch: [
      { query: options.dense, using: "dense", limit: 40, filter },
      { query: options.keywords, using: "bm25", limit: 40, filter },
    ],
    query: { fusion: "rrf" },
    limit: options.limit,
    with_payload: true,
  });
  return (result.result?.points ?? []).map((point) => point.payload);
}

/** Build index points for a document's pages (vectors filled in by the caller). */
export function buildPassages(doc: {
  documentId: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  pages: { page: number; content: string }[];
}) {
  const passages: { id: string; embedText: string; keywords: SparseVector; payload: PassagePayload }[] = [];
  for (const { page, content } of doc.pages) {
    splitIntoPassages(content).forEach((text, indexOnPage) => {
      passages.push({
        id: randomUUID(),
        // The embedding also "sees" which file and page the passage is from.
        embedText: `${doc.fileName}, page ${page}\n\n${text}`,
        keywords: keywordVector(`${doc.fileName} ${text}`),
        payload: {
          text,
          file_name: doc.fileName,
          page_number: page,
          chunk_index: passages.length,
          chunk_on_page: indexOnPage,
          document_id: doc.documentId,
          workspace_id: doc.workspaceId,
          mime_type: doc.mimeType,
          created_at: new Date().toISOString(),
        },
      });
    });
  }
  return passages;
}
