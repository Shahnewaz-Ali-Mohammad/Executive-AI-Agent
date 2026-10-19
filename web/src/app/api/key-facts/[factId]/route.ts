/**
 * PATCH  /api/key-facts/:factId → correct, confirm or dismiss
 *        body: { kind?, label?, date?, value?, page?, status?, reminderDays? }
 *        A new date restarts its reminders.
 * DELETE /api/key-facts/:factId → remove it
 */
import { deleteFact, updateFact } from "@/lib/data/facts";
import { handleRouteError } from "@/lib/http";

type Context = RouteContext<"/api/key-facts/[factId]">;

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { factId } = await ctx.params;
    return Response.json(await updateFact(factId, await request.json().catch(() => ({}))));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { factId } = await ctx.params;
    await deleteFact(factId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
