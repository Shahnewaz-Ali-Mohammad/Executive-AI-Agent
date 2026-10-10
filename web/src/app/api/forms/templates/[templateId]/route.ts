/**
 * PATCH  /api/forms/templates/:templateId → replace name, description and fields
 * DELETE /api/forms/templates/:templateId → delete (saved forms that used it are kept)
 */
import { deleteTemplate, updateTemplate } from "@/lib/data/forms";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/forms/templates/[templateId]">;

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { templateId } = await ctx.params;
    const body = await request.json().catch(() => null);
    if (!body) throw new HttpError(400, "Expected a JSON body.");
    return Response.json(await updateTemplate(templateId, body));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { templateId } = await ctx.params;
    await deleteTemplate(templateId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
