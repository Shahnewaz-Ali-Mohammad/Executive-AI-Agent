/**
 * Proxy (formerly "middleware"): runs before every page and API request.
 *
 * Its only job is the login gate. Requests without a valid session cookie
 * are sent to /login (pages) or get a 401 (API calls).
 *
 * Not gated:
 *  - the login page and login API,
 *  - /api/internal/*  → called by n8n, protected by the shared secret instead,
 *  - /api/health      → for uptime checks,
 *  - static assets (excluded by the matcher below).
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];
const PUBLIC_PREFIXES = ["/api/internal/"];

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";

  // No password configured → login disabled (local development only).
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, secret)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next.js internals and static files (anything with a file extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
