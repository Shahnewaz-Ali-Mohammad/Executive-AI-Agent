/**
 * POST /api/internal/automation/runs/:runId/delivered — n8n reports whether
 * the email for a run went out.
 *
 * Body: { email: "sent" | "failed" | "skipped", error? }
 * A failed email becomes a notification for the CEO.
 */
import { z } from "zod";
import { requireWebhookSecret } from "@/lib/auth/webhook";
import { recordDelivery } from "@/lib/data/automation";
import { handleRouteError, HttpError } from "@/lib/http";

type Context = RouteContext<"/api/internal/automation/runs/[runId]/delivered">;

const bodySchema = z.object({
  email: z.enum(["sent", "failed", "skipped"]),
  error: z.string().max(2000).nullish(),
});

export async function POST(request: Request, ctx: Context) {
  try {
    requireWebhookSecret(request);
    const { runId } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Expected { email: sent | failed | skipped }.");
    await recordDelivery(runId, parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
