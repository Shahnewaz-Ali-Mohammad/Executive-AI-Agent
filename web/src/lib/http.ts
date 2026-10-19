/**
 * Small helpers shared by all API route handlers, so every route returns
 * errors in the same `{ error: "..." }` shape.
 */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { describeDatabaseError } from "@/lib/db/errors";
import type { ApiErrorBody } from "@/lib/types";

/** Throw this from anywhere in a route to return a specific status + message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ApiErrorBody, { status });
}

/**
 * Convert any thrown error into a JSON response. Known `HttpError`s keep their
 * message, database problems get a "what to do" message, and anything else is
 * logged and hidden behind a generic message.
 */
export function handleRouteError(error: unknown): Response {
  // Next.js's own control-flow errors (e.g. "this route is dynamic") must pass through.
  unstable_rethrow(error);
  if (error instanceof HttpError) return jsonError(error.message, error.status);

  // Database not running, tables missing, wrong database: say what to do.
  const databaseProblem = describeDatabaseError(error);
  if (databaseProblem) {
    console.error("[api] Database problem:", databaseProblem);
    return jsonError(databaseProblem, 503);
  }

  console.error("[api] Unexpected error:", error);
  return jsonError("Something went wrong. Please try again.", 500);
}

/** Basic UUID check, so malformed ids get a 404 instead of a database error. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
