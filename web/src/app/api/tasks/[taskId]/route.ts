/**
 * PATCH  /api/tasks/:taskId → change its status   body: { status: "open" | "done" | "cancelled" }
 * DELETE /api/tasks/:taskId → delete it
 */
import { z } from "zod";
import { deleteTask, setTaskStatus } from "@/lib/data/tasks";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/tasks/[taskId]">;

const updateSchema = z.object({ status: z.enum(["open", "done", "cancelled"]) });

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { taskId } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Expected { status }.");
    return Response.json(await setTaskStatus(taskId, parsed.data.status));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { taskId } = await ctx.params;
    await deleteTask(taskId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
