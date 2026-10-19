/**
 * POST /api/workspaces/:workspaceId/key-facts/rescan → read the documents again for dates and facts
 *      body: { documentId?, onlyNotRead? }  (one document, those never read, or all of them)
 * Facts already confirmed or dismissed are kept; only unchecked ones are replaced.
 */
import { z } from "zod";
import { rescanDocuments } from "@/lib/data/facts-extract";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError, isUuid } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/key-facts/rescan">;

const bodySchema = z.object({ documentId: z.string().nullish(), onlyNotRead: z.boolean().optional() });

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const documentId = parsed.success ? parsed.data.documentId : null;
    const onlyNotRead = parsed.success ? parsed.data.onlyNotRead : false;
    if (documentId && !isUuid(documentId)) throw new HttpError(404, "Document not found.");
    const queued = await rescanDocuments(workspaceId, { documentId: documentId ?? undefined, onlyNotRead });
    if (documentId && queued === 0) throw new HttpError(409, "That document isn't ready yet.");
    return Response.json({ queued }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
