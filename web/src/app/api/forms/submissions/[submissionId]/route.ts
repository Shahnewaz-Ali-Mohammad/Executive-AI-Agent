/**
 * GET    /api/forms/submissions/:submissionId → one saved form
 * PATCH  /api/forms/submissions/:submissionId → change its values   body: { values }
 * DELETE /api/forms/submissions/:submissionId → delete it
 */
import { z } from "zod";
import { deleteSubmission, requireSubmission, updateSubmission } from "@/lib/data/forms";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/forms/submissions/[submissionId]">;

const updateSchema = z.object({ values: z.record(z.string(), z.unknown()) });

export async function GET(_request: Request, ctx: Context) {
  try {
    const { submissionId } = await ctx.params;
    return Response.json(await requireSubmission(submissionId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  try {
    const { submissionId } = await ctx.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Expected { values }.");
    return Response.json(await updateSubmission(submissionId, parsed.data.values));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, ctx: Context) {
  try {
    const { submissionId } = await ctx.params;
    await deleteSubmission(submissionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
