/**
 * GET /api/notifications?limit=30 → { items, unreadCount, scheduler }
 *     The newest notifications across all workspaces, plus whether n8n's
 *     scheduler is checking in. The bell polls this.
 */
import { getSchedulerStatus } from "@/lib/data/automation";
import { listNotifications } from "@/lib/data/notifications";
import { handleRouteError } from "@/lib/http";
import type { NotificationFeedDTO } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 30));
    const [feed, scheduler] = await Promise.all([listNotifications(limit), getSchedulerStatus()]);
    return Response.json({ ...feed, scheduler } satisfies NotificationFeedDTO, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
