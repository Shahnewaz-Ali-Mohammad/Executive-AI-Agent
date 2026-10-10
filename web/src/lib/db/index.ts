/**
 * Database connection.
 *
 * A single connection pool is shared by the whole server. It is created on
 * first use (not at import), so `next build` doesn't need a database.
 * In development, Next.js reloads modules on every change, so the pool is
 * cached on `globalThis` to avoid opening a new pool (and leaking
 * connections) each time.
 */
import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { executiveDb?: Database };

function createDatabase(): Database {
  const client = postgres(env.DATABASE_URL, {
    max: 10, // plenty for a single-company internal tool
  });
  return drizzle(client, { schema });
}

/** The Drizzle database. Use it like `db.select().from(schema.workspaces)`. */
export const db = new Proxy({} as Database, {
  get(_target, key) {
    const instance = (globalForDb.executiveDb ??= createDatabase());
    const value = Reflect.get(instance, key);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
