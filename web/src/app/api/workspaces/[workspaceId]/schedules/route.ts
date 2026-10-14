/**
 * GET  /api/workspaces/:workspaceId/schedules → scheduled reports and reminders, active first
 * POST /api/workspaces/:workspaceId/schedules → create one
 *      body: { scheduleKind, title, prompt, mode?, recurrence, timeZone?, notifyEmail?, conversationId?, messageId? }
 */
import { z } from "zod";
import { scheduleInputSchema } from "@/lib/cards";
import { requireConversation } from "@/lib/data/conversations";
import { updateMessageCard } from "@/lib/data/messages";
import { createSchedule, listSchedules } from "@/lib/data/schedules";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/schedules">;

const extraSchema = z.object({
  conversationId: z.string().nullish(),
  messageId: z.string().max(100).nullish(),
});

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return Response.json(await listSchedules(workspaceId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const body = await request.json().catch(() => null);
    const extra = extraSchema.safeParse(body ?? {});
    const parsed = scheduleInputSchema.safeParse(body);
    if (!parsed.success || !extra.success) {
      throw new HttpError(400, parsed.error?.issues[0]?.message ?? "Invalid schedule.");
    }
    const { conversationId, messageId } = extra.data;
    if (conversationId) await requireConversation(conversationId, workspaceId);

    const created = await createSchedule({ workspaceId, conversationId, schedule: parsed.data });
    if (messageId) {
      const s = parsed.data;
      await updateMessageCard(messageId, workspaceId, (card) =>
        card.kind === "schedule"
          ? {
              ...card,
              scheduleKind: s.scheduleKind,
              title: s.title,
              prompt: s.prompt,
              mode: created.mode,
              recurrence: s.recurrence,
              timeZone: created.timeZone,
              notifyEmail: s.notifyEmail,
              scheduleId: created.id,
              nextRunAt: created.nextRunAt,
            }
          : card,
      );
    }
    return Response.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
