/**
 * Runs once when the Next.js server starts.
 *
 * Brings the database up to date automatically, so nobody has to remember
 * `npm run db:migrate`. If the database isn't reachable yet (Docker not
 * started), the app still starts and pages explain what to do.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { migrateDatabase } = await import("@/lib/db/migrate");
  const { describeDatabaseError } = await import("@/lib/db/errors");
  try {
    await migrateDatabase();
    console.log("[startup] Database is up to date.");
  } catch (error) {
    console.error(
      "[startup] Could not update the database:",
      describeDatabaseError(error) ?? (error instanceof Error ? error.message : error),
    );
  }
}
