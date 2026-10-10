/**
 * POST /api/auth/login   body: { password }
 * Sets the signed session cookie when the password matches APP_PASSWORD.
 */
import { cookies } from "next/headers";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { handleRouteError, HttpError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";

    // Small fixed delay makes password guessing slower.
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!env.APP_PASSWORD || !safeEqual(password, env.APP_PASSWORD)) {
      throw new HttpError(401, "Incorrect password.");
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await createSessionToken(env.SESSION_SECRET), {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
