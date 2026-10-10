/**
 * GET /api/conversations/:conversationId/messages → the conversation's messages, oldest first
 */
import { requireConversation } from "@/lib/data/conversations";
import { listMessages } from "@/lib/data/messages";
import { handleRouteError } from "@/lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[conversationId]/messages">) {
  try {
    const { conversationId } = await ctx.params;
    await requireConversation(conversationId);
    return Response.json(await listMessages(conversationId));
  } catch (error) {
    return handleRouteError(error);
  }
}
