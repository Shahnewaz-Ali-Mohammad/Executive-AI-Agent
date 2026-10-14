/**
 * GET  /api/workspaces/:workspaceId/tasks → open tasks (soonest due first), then recently finished ones
 * POST /api/workspaces/:workspaceId/tasks → create a task
 *      body: { title, details?, assigneeName?, assigneeEmail?, dueDate?, dueTime?, timeZone?, conversationId?, messageId? }
 *      (messageId: the chat card it was created from, which is then marked as created)
 */
import { z } from "zod";
import { taskInputSchema } from "@/lib/cards";
import { requireConversation } from "@/lib/data/conversations";
import { updateMessageCard } from "@/lib/data/messages";
import { createTask, listTasks } from "@/lib/data/tasks";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/tasks">;

const createSchema = taskInputSchema.extend({
  conversationId: z.string().nullish(),
  messageId: z.string().max(100).nullish(),
});

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return Response.json(await listTasks(workspaceId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid task.");
    const { conversationId, messageId, ...task } = parsed.data;
    if (conversationId) await requireConversation(conversationId, workspaceId);

    const created = await createTask({ workspaceId, conversationId, task });
    if (messageId) {
      await updateMessageCard(messageId, workspaceId, (card) =>
        card.kind === "task" ? { ...card, ...task, details: task.details ?? "", taskId: created.id } : card,
      );
    }
    return Response.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
