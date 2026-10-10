/**
 * GET  /api/workspaces/:workspaceId/documents → list documents (newest first)
 * POST /api/workspaces/:workspaceId/documents → upload one or more files
 *      multipart/form-data with one or more "file" fields
 *
 * Upload flow:
 *   1. validate type and size
 *   2. save the original (the citation viewer needs it)
 *   3. create the document row with status "processing"
 *   4. hand it to the AI backend, which indexes it in the background and
 *      later marks it "ready" (or "failed")
 * The browser polls the list to see the status change.
 */
import { aiBackend } from "@/lib/ai-backend";
import { completeIngestion, createDocument, listDocuments } from "@/lib/data/documents";
import { requireWorkspace } from "@/lib/data/workspaces";
import { env } from "@/lib/env";
import { resolveMimeType } from "@/lib/file-types";
import { handleRouteError, HttpError } from "@/lib/http";
import { buildStorageKey, saveFile } from "@/lib/storage";
import type { DocumentDTO } from "@/lib/types";

type Context = RouteContext<"/api/workspaces/[workspaceId]/documents">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return Response.json(await listDocuments(workspaceId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);

    const form = await request.formData().catch(() => {
      throw new HttpError(400, "Expected a multipart/form-data upload.");
    });
    const files = form.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length === 0) throw new HttpError(400, "No file received.");

    // Validate everything before storing anything.
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    for (const file of files) {
      if (!resolveMimeType(file.name)) {
        throw new HttpError(415, `"${file.name}" is not a supported file type.`);
      }
      if (file.size > maxBytes) {
        throw new HttpError(413, `"${file.name}" is larger than ${env.MAX_UPLOAD_MB} MB.`);
      }
      if (file.size === 0) throw new HttpError(400, `"${file.name}" is empty.`);
    }

    const created: DocumentDTO[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const mimeType = resolveMimeType(file.name)!;
      const storageKey = buildStorageKey(workspaceId, id, file.name);
      const data = new Uint8Array(await file.arrayBuffer());

      await saveFile(storageKey, data);
      const document = await createDocument({
        id,
        workspaceId,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        storageKey,
      });

      try {
        await aiBackend.startIngestion({ documentId: id, workspaceId, fileName: file.name, mimeType, data });
        created.push(document);
      } catch (error) {
        // Keep the file and record, but show the CEO why it isn't searchable.
        console.error("[upload] could not start indexing:", error);
        const message = error instanceof Error ? error.message : "Could not start indexing.";
        await completeIngestion({ status: "failed", documentId: id, error: message });
        created.push({ ...document, status: "failed", error: message });
      }
    }

    return Response.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
