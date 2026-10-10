/**
 * Apply database migrations (the SQL files in /web/drizzle).
 * Called once when the server starts (see src/instrumentation.ts), so a new
 * install or an update never runs against missing tables.
 */
import "server-only";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/lib/env";

export async function migrateDatabase(): Promise<void> {
  // A short-lived single connection, separate from the app's pool.
  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {}, connect_timeout: 5 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle"),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
