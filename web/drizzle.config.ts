/**
 * Drizzle Kit configuration (database migrations).
 *   npm run db:generate  → create a migration from changes in src/lib/db/schema.ts
 *   npm run db:migrate   → apply pending migrations to DATABASE_URL
 */
import { defineConfig } from "drizzle-kit";

// DATABASE_URL comes from the shared .env at the project root
// (loaded by the npm script: `dotenv -e ../.env -- drizzle-kit …`).

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
