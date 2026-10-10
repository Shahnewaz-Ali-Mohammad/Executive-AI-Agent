/**
 * Applies database migrations (the SQL files in /web/drizzle) to DATABASE_URL.
 *
 *   npm run db:migrate          (development: reads the root .env)
 *   node scripts/migrate.mjs    (Docker: runs automatically before the server starts)
 *
 * Safe to run repeatedly: already-applied migrations are skipped.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const client = postgres(url, { max: 1, onnotice: () => {} }); // hide "already exists" notices

try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Database is up to date.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
