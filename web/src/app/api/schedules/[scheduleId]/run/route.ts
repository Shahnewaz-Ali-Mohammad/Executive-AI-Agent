/**
 * POST /api/schedules/:scheduleId/run → run it now, in addition to its schedule.
 * The run is queued; n8n's scheduler picks it up within a minute.
 */
import { runScheduleNow } from "@/lib/data/schedules";
import { handleRouteError } from "@/lib/http";

type Context = RouteContext<"/api/schedules/[scheduleId]/run">;

export async function POST(_request: Request, ctx: Context) {
  try {
    const { scheduleId } = await ctx.params;
    return Response.json(await runScheduleNow(scheduleId), { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
