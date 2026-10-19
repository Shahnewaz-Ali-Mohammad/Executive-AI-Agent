/**
 * Document data access: creating records for uploads, recording the result
 * of indexing, and reading pages for the citation viewer.
 */
import "server-only";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { IngestionResult } from "@/lib/ai-backend/types";
import type { CitableDocument } from "@/lib/citations";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, isUuid } from "@/lib/http";
import { queueFactExtraction, resumeFactExtraction } from "./facts-extract";
import type { DocumentDTO, DocumentPageDTO } from "@/lib/types";

const { documents, documentPages } = schema;

function toDTO(row: schema.DocumentRecord): DocumentDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    pageCount: row.pageCount,
    chunkCount: row.chunkCount,
    summary: row.summary,
    error: row.error,
    category: row.category,
    tags: row.tags,
    factsStatus: row.factsStatus as DocumentDTO["factsStatus"],
    warnings: row.warnings,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Mark documents stuck in "processing" for too long as failed. A crashed or
 * misconfigured n8n workflow would otherwise leave them spinning forever.
 */
async function failStuckDocuments(workspaceId: string): Promise<void> {
  const cutoff = new Date(Date.now() - env.INGEST_TIMEOUT_MINUTES * 60_000);
  await db
    .update(documents)
    .set({
      status: "failed",
      error: `Indexing did not finish within ${env.INGEST_TIMEOUT_MINUTES} minutes. Check the n8n executions log.`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.status, "processing"),
        lt(documents.updatedAt, cutoff),
      ),
    );
}

export async function listDocuments(workspaceId: string): Promise<DocumentDTO[]> {
  await failStuckDocuments(workspaceId);
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));
  resumeFactExtraction(rows);
  return rows.map(toDTO);
}

/** Names and ids of the workspace's indexed documents, for resolving citations. */
export async function listCitableDocuments(workspaceId: string): Promise<CitableDocument[]> {
  return db
    .select({ id: documents.id, fileName: documents.fileName })
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.status, "ready")));
}

export async function createDocument(input: {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<DocumentDTO> {
  const [row] = await db.insert(documents).values({ ...input, status: "processing" }).returning();
  return toDTO(row);
}

/** Load a document (including its storage key) or throw 404. */
export async function requireDocument(id: string): Promise<schema.DocumentRecord> {
  if (!isUuid(id)) throw new HttpError(404, "Document not found.");
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw new HttpError(404, "Document not found.");
  return row;
}

export async function getDocumentDTO(id: string): Promise<DocumentDTO> {
  return toDTO(await requireDocument(id));
}

/** All documents of a workspace, with storage keys (used when deleting a workspace). */
export async function listDocumentRecords(workspaceId: string): Promise<schema.DocumentRecord[]> {
  return db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
}

export async function deleteDocumentRecord(id: string): Promise<void> {
  await db.delete(documents).where(eq(documents.id, id));
}

/**
 * Record the outcome of indexing. Called by the n8n callback route and by the
 * mock backend. On success, the page texts replace any previous ones.
 */
export async function completeIngestion(result: IngestionResult): Promise<void> {
  const existing = await requireDocument(result.documentId);

  if (result.status === "failed") {
    await db
      .update(documents)
      .set({ status: "failed", error: result.error, updatedAt: new Date() })
      .where(eq(documents.id, existing.id));
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(documentPages).where(eq(documentPages.documentId, existing.id));

    // Insert in batches so very long documents don't exceed query size limits.
    const pages = result.pages.map((page) => ({
      documentId: existing.id,
      pageNumber: page.page,
      content: page.content,
    }));
    for (let i = 0; i < pages.length; i += 200) {
      await tx
        .insert(documentPages)
        .values(pages.slice(i, i + 200))
        .onConflictDoNothing();
    }

    await tx
      .update(documents)
      .set({
        status: "ready",
        chunkCount: result.totalChunks,
        pageCount: pages.length || null,
        summary: result.summary ?? null,
        error: null,
        factsStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, existing.id));
  });

  // Then read its key dates and facts in the background.
  queueFactExtraction([existing.id]);
}

/** The text of one page, for the citation viewer. */
export async function getDocumentPage(documentId: string, pageNumber: number): Promise<DocumentPageDTO> {
  const document = await requireDocument(documentId);
  const [page] = await db
    .select()
    .from(documentPages)
    .where(and(eq(documentPages.documentId, documentId), eq(documentPages.pageNumber, pageNumber)));

  return {
    documentId,
    pageNumber,
    pageCount: document.pageCount,
    content: page?.content ?? "",
  };
}

/** Every page of every ready document in a workspace (used by the mock backend's search). */
export async function listWorkspacePages(workspaceId: string) {
  return db
    .select({
      fileName: documents.fileName,
      pageNumber: documentPages.pageNumber,
      content: documentPages.content,
    })
    .from(documentPages)
    .innerJoin(documents, eq(documents.id, documentPages.documentId))
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.status, "ready")))
    .orderBy(asc(documents.fileName), asc(documentPages.pageNumber));
}

