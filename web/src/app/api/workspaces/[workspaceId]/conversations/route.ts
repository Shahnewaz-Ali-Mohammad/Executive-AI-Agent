/**
 * GET  /api/workspaces/:workspaceId/conversations → saved chats, newest first
 * POST /api/workspaces/:workspaceId/conversations → start a new one   body: { title? }
 */
import { z } from "zod";
import { createConversation, listConversations } from "@/lib/data/conversations";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/conversations">;

const createSchema = z.object({ title: z.string().trim().max(120).optional() });

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return Response.json(await listConversations(workspaceId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const parsed = createSchema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) throw new HttpError(400, "Invalid conversation title.");
    return Response.json(await createConversation(workspaceId, parsed.data.title), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
