/**
 * POST /api/internal/ingest-callback — called by the n8n ingestion workflow
 * when a document has been parsed and indexed (or has failed).
 *
 * Not behind the login (n8n has no session); instead it requires the same
 * shared secret the app sends to n8n, in the `x-webhook-secret` header.
 *
 * Body (see ingestionResultSchema):
 *   { status: "ready",  documentId, totalChunks, summary?, pages: [{ page, content }] }
 *   { status: "failed", documentId, error }
 */
import { ingestionResultSchema } from "@/lib/ai-backend/types";
import { safeEqual } from "@/lib/auth/session";
import { completeIngestion } from "@/lib/data/documents";
import { env } from "@/lib/env";
import { handleRouteError, HttpError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-webhook-secret") ?? "";
    if (!env.N8N_SHARED_SECRET || !safeEqual(secret, env.N8N_SHARED_SECRET)) {
      throw new HttpError(401, "Invalid webhook secret.");
    }

    const parsed = ingestionResultSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      console.error("[ingest-callback] invalid body:", parsed.error.issues);
      throw new HttpError(400, "Invalid ingestion result.");
    }

    await completeIngestion(parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
