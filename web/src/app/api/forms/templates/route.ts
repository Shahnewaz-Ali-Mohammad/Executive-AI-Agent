/**
 * GET  /api/forms/templates → all form templates, by name
 * POST /api/forms/templates → create one
 *      body: { name, description?, fields: [{ label, type, required, options?, hint? }],
 *              messageId?, workspaceId? }  (messageId: the chat card it was saved from)
 */
import { z } from "zod";
import { createTemplate, listTemplates, updateMessageForm } from "@/lib/data/forms";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

const sourceSchema = z.object({ messageId: z.string().max(100).optional(), workspaceId: z.string().optional() });

export async function GET() {
  try {
    return Response.json(await listTemplates());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new HttpError(400, "Expected a JSON body.");
    const template = await createTemplate(body as Parameters<typeof createTemplate>[0]);

    // Saved from a card in the chat: mark that card as saved.
    const source = sourceSchema.safeParse(body);
    if (source.success && source.data.messageId && source.data.workspaceId) {
      await requireWorkspace(source.data.workspaceId);
      await updateMessageForm(source.data.messageId, source.data.workspaceId, (form) =>
        form.kind === "template" ? { ...form, templateId: template.id, fields: template.fields } : form,
      );
    }
    return Response.json(template, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
