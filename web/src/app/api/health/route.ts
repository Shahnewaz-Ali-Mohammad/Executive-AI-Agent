/**
 * GET /api/health — quick check that the app and its database are up.
 * Public (no login), so uptime monitors and Docker can call it.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { describeDatabaseError } from "@/lib/db/errors";
import { env } from "@/lib/env";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", aiBackend: env.AI_BACKEND });
  } catch (error) {
    const detail = describeDatabaseError(error) ?? "database unreachable";
    return Response.json({ status: "error", detail }, { status: 503 });
  }
}
