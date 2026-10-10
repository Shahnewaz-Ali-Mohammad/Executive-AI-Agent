/**
 * GET  /api/workspaces/:workspaceId/forms → saved forms in this workspace, newest first
 * POST /api/workspaces/:workspaceId/forms → save a filled form
 *      body: { templateId, values, conversationId?, messageId? }
 *      (messageId: the chat card it was saved from, which is then marked as saved)
 */
import { z } from "zod";
import { requireConversation } from "@/lib/data/conversations";
import { createSubmission, listSubmissions, updateMessageForm } from "@/lib/data/forms";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/forms">;

const createSchema = z.object({
  templateId: z.string(),
  values: z.record(z.string(), z.unknown()),
  conversationId: z.string().nullish(),
  messageId: z.string().max(100).nullish(),
});

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    return Response.json(await listSubmissions(workspaceId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Expected { templateId, values }.");
    const { templateId, values, conversationId, messageId } = parsed.data;
    if (conversationId) await requireConversation(conversationId, workspaceId);

    const submission = await createSubmission({ templateId, workspaceId, conversationId, values });
    if (messageId) {
      await updateMessageForm(messageId, workspaceId, (form) =>
        form.kind === "fill" ? { ...form, values: submission.values, submissionId: submission.id } : form,
      );
    }
    return Response.json(submission, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
