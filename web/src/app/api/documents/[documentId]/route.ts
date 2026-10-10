/**
 * GET    /api/documents/:documentId → document details (status, digest, …)
 * DELETE /api/documents/:documentId → remove the file, its search index
 *                                      entries and its database records
 */
import { aiBackend } from "@/lib/ai-backend";
import { deleteDocumentRecord, getDocumentDTO, requireDocument } from "@/lib/data/documents";
import { handleRouteError } from "@/lib/http";
import { deleteFile } from "@/lib/storage";

type Context = RouteContext<"/api/documents/[documentId]">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const { documentId } = await ctx.params;
    return Response.json(await getDocumentDTO(documentId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { documentId } = await ctx.params;
    const document = await requireDocument(documentId);

    // Search index first: if that fails, nothing is lost and the CEO can retry.
    await aiBackend.removeDocument({ documentId, workspaceId: document.workspaceId });
    await deleteFile(document.storageKey);
    await deleteDocumentRecord(documentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
