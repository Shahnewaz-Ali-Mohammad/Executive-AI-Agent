/**
 * GET  /api/workspaces/:workspaceId/key-facts → { facts, settings }: every date and fact read from the documents
 * POST /api/workspaces/:workspaceId/key-facts → add one by hand
 *      body: { documentId, kind, label, date?, value?, page?, reminderDays? }
 */
import { createFact, getFactSettings, listFacts } from "@/lib/data/facts";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError } from "@/lib/http";
import type { KeyFactsDTO } from "@/lib/types";

type Context = RouteContext<"/api/workspaces/[workspaceId]/key-facts">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const [facts, settings] = await Promise.all([listFacts(workspaceId), getFactSettings(workspaceId)]);
    return Response.json({ facts, settings } satisfies KeyFactsDTO);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    await requireWorkspace(workspaceId);
    const body = await request.json().catch(() => ({}));
    return Response.json(await createFact(workspaceId, body), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
