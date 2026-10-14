/**
 * POST /api/notifications/read → mark as read
 *      body: { ids: [...] } for some, or {} for all
 */
import { z } from "zod";
import { markNotificationsRead } from "@/lib/data/notifications";
import { handleRouteError, HttpError } from "@/lib/http";

const schema = z.object({ ids: z.array(z.string()).max(500).optional() });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "Expected { ids? }.");
    await markNotificationsRead(parsed.data.ids);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
