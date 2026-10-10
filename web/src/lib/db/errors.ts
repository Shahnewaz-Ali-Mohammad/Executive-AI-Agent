/**
 * Turn low-level database errors into messages that say what to do.
 *
 * Without this, a stopped database or a missing table just shows
 * "Something went wrong". These are the problems people actually hit when
 * starting the app on their own machine.
 */
import "server-only";

interface PgLikeError {
  code?: string;
  message?: string;
  cause?: unknown;
}

/** Walk the error and its causes, collecting codes and messages. */
function flatten(error: unknown): PgLikeError[] {
  const chain: PgLikeError[] = [];
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    chain.push(current as PgLikeError);
    current = (current as PgLikeError).cause;
  }
  return chain;
}

/** A readable explanation for a database problem, or null if it isn't one. */
export function describeDatabaseError(error: unknown): string | null {
  const chain = flatten(error);
  const codes = new Set(chain.map((e) => e.code).filter(Boolean));
  const text = chain.map((e) => e.message ?? "").join(" ");

  if (codes.has("ECONNREFUSED") || /ECONNREFUSED|connect ETIMEDOUT/.test(text)) {
    return "Can't reach the database. Start it with `docker compose up -d` in the executive-agent folder, then reload.";
  }
  if (codes.has("42P01") || /relation .* does not exist/.test(text)) {
    return "The database tables don't exist yet. Run `npm run db:migrate` in the web folder (or restart the app), then reload.";
  }
  if (codes.has("28P01") || codes.has("28000") || codes.has("3D000") || /password authentication failed|role .* does not exist|database .* does not exist/.test(text)) {
    return (
      "Connected to a database that isn't this app's. Another Postgres may already be using the port. " +
      "Check DATABASE_URL in .env and run `docker compose ps` to see whether this app's database started."
    );
  }
  return null;
}
