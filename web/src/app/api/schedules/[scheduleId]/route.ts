/**
 * PATCH  /api/schedules/:scheduleId → pause or resume   body: { active: boolean }
 * DELETE /api/schedules/:scheduleId → delete it (past results stay under the bell)
 */
import { z } from "zod";
import { deleteSchedule, setScheduleActive } from "@/lib/data/schedules";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/schedules/[scheduleId]">;

const updateSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { scheduleId } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Expected { active }.");
    return Response.json(await setScheduleActive(scheduleId, parsed.data.active));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { scheduleId } = await ctx.params;
    await deleteSchedule(scheduleId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
