/**
 * POST /api/internal/automation/due — called by n8n's scheduler every minute.
 *
 * Records that the scheduler is alive, queues everything that has fallen due
 * and returns the runs n8n should execute now (each handed out only once).
 *
 * Header: x-webhook-secret: <N8N_SHARED_SECRET>
 * Body:   { emailEnabled: boolean }   (whether n8n has SMTP set up)
 * Reply:  { runs: [{ runId, type, title }] }
 */
import { z } from "zod";
import { requireWebhookSecret } from "@/lib/auth/webhook";
import { claimDueRuns } from "@/lib/data/automation";
import { handleRouteError } from "@/lib/http";

const bodySchema = z.object({ emailEnabled: z.coerce.boolean().optional().default(false) });

export async function POST(request: Request) {
  try {
    requireWebhookSecret(request);
    const body = bodySchema.parse((await request.json().catch(() => ({}))) ?? {});
    const runs = await claimDueRuns({ emailEnabled: body.emailEnabled });
    return Response.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
