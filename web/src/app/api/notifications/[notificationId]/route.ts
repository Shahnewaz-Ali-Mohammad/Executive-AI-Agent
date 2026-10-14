/**
 * GET    /api/notifications/:notificationId → the full notification (a report in Markdown, with citations); marks it read
 * DELETE /api/notifications/:notificationId → remove it
 */
import { deleteNotification, openNotification } from "@/lib/data/notifications";
import { handleRouteError } from "@/lib/http";

type Context = RouteContext<"/api/notifications/[notificationId]">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const { notificationId } = await ctx.params;
    return Response.json(await openNotification(notificationId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { notificationId } = await ctx.params;
    await deleteNotification(notificationId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
