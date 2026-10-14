/**
 * Check the shared secret on calls from n8n (the /api/internal/* routes are
 * outside the login, so this header is what protects them).
 */
import "server-only";
import { safeEqual } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";

export function requireWebhookSecret(request: Request): void {
  const secret = request.headers.get("x-webhook-secret") ?? "";
  if (!env.N8N_SHARED_SECRET || !safeEqual(secret, env.N8N_SHARED_SECRET)) {
    throw new HttpError(401, "Invalid webhook secret.");
  }
}
