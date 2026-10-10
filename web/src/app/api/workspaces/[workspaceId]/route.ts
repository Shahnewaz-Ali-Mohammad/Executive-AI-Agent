/**
 * PATCH  /api/workspaces/:workspaceId → rename      body: { name }
 * DELETE /api/workspaces/:workspaceId → delete the workspace, its files,
 *                                        search index entries and chat
 */
import { z } from "zod";
import { aiBackend } from "@/lib/ai-backend";
import { listDocumentRecords } from "@/lib/data/documents";
import { deleteWorkspace, renameWorkspace, requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";
import { deleteFile } from "@/lib/storage";

const renameSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/workspaces/[workspaceId]">) {
  try {
    const { workspaceId } = await ctx.params;
    const parsed = renameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Name is required.");
    return Response.json(await renameWorkspace(workspaceId, parsed.data.name));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/workspaces/[workspaceId]">) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);

    // Clean up outside the database first: search index entries and stored files.
    for (const document of await listDocumentRecords(workspaceId)) {
      await aiBackend.removeDocument({ documentId: document.id, workspaceId });
      await deleteFile(document.storageKey);
    }
    await deleteWorkspace(workspaceId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
