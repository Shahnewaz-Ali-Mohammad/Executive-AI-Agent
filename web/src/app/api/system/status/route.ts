/**
 * GET /api/system/status → is every part of the system working?
 *
 *   { checkedAt, checks: [{ id, label, state: ok | warning | error | off, detail, fix? }] }
 *
 * Database, search index (Qdrant), AI (OpenAI key set), n8n, the n8n
 * scheduler (heartbeat) and email (SMTP set up in n8n). Each check has a
 * short time limit so the page never hangs. Never returns secrets.
 */
import { getSystemStatus } from "@/lib/system-status";
import { handleRouteError } from "@/lib/http";

export async function GET() {
  try {
    return Response.json(await getSystemStatus(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
