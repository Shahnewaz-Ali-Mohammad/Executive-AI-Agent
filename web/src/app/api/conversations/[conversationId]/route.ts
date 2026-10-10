/**
 * PATCH  /api/conversations/:conversationId → rename   body: { title }
 * DELETE /api/conversations/:conversationId → delete the conversation and its
 *                                              messages (documents are kept)
 */
import { z } from "zod";
import { deleteConversation, renameConversation } from "@/lib/data/conversations";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/conversations/[conversationId]">;

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { conversationId } = await ctx.params;
    const parsed = renameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Title is required.");
    return Response.json(await renameConversation(conversationId, parsed.data.title));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { conversationId } = await ctx.params;
    await deleteConversation(conversationId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
