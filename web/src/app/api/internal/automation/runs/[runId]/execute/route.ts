/**
 * POST /api/internal/automation/runs/:runId/execute — n8n runs one claimed job.
 *
 * Writes the report (or reminder / task message), saves it as a notification
 * and returns the email n8n should send, if any:
 *
 *   { runId, status: "succeeded" | "failed", title, email: { to, subject, text, html } | null }
 *
 * A failed report still answers 200 with status "failed" (and a notification
 * for the CEO), so the n8n workflow carries on with the next run.
 */
import { requireWebhookSecret } from "@/lib/auth/webhook";
import { executeRun } from "@/lib/data/automation";
import { handleRouteError } from "@/lib/http";

/** Reports can take a few minutes with the deep model. */
export const maxDuration = 600;

type Context = RouteContext<"/api/internal/automation/runs/[runId]/execute">;

export async function POST(request: Request, ctx: Context) {
  try {
    requireWebhookSecret(request);
    const { runId } = await ctx.params;
    return Response.json(await executeRun(runId));
  } catch (error) {
    return handleRouteError(error);
  }
}
