/**
 * Server-side environment configuration.
 *
 * Every setting the app reads from the environment is declared and validated
 * here, so a missing or malformed value fails loudly at startup instead of
 * deep inside a request. Import `env` from this file instead of reading
 * `process.env` directly anywhere else in the server code.
 *
 * Values come from the single `.env` file at the project root (loaded by the
 * npm scripts), or from the container environment in Docker.
 *
 * Validation runs on first use rather than at import time, so `next build`
 * works without secrets (e.g. when building the Docker image).
 */
import "server-only";
import { z } from "zod";

/**
 * Local-development fallback, so the app runs on your own machine even
 * without a .env file. Refused in production (see loadEnv).
 */
const DEV_SESSION_SECRET = "local-dev-session-secret-change-me";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // --- Database & file storage -------------------------------------------
  /** Default matches docker-compose.yml's default Postgres user/password. */
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://exec:exec-local-password@localhost:55432/executive_agent"),
  /** Folder where original uploaded files are kept (relative to /web or absolute). */
  STORAGE_DIR: z.string().default("./storage"),
  /** Largest file the CEO can upload, in megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),

  // --- Login --------------------------------------------------------------
  /** Shared password for the web app. Leave empty to disable login (local dev only). */
  APP_PASSWORD: z.string().optional().default(""),
  /** Random string used to sign the session cookie. Must be set in production. */
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters").default(DEV_SESSION_SECRET),

  // --- AI backend -----------------------------------------------------------
  /**
   * "openai" → the web app calls OpenAI and Qdrant directly (no n8n needed).
   * "n8n"    → the same pipeline, run as n8n workflows you can edit visually.
   * "mock"   → no AI keys needed: local text extraction + keyword search,
   *            so you can try the whole UI before anything else is set up.
   */
  AI_BACKEND: z.enum(["openai", "n8n", "mock"]).default("mock"),
  /** Where the Next.js server reaches n8n (from the host: http://localhost:5678). */
  N8N_BASE_URL: z.string().url().default("http://localhost:5678"),
  /** Shared secret sent to n8n, and expected back on n8n's callbacks. */
  /** Default matches docker-compose.yml's default (local use only). */
  N8N_SHARED_SECRET: z.string().default("local-dev-shared-secret-change-me"),
  /** Where n8n (inside Docker) reaches this app for callbacks. */
  APP_INTERNAL_URL: z.string().url().default("http://host.docker.internal:3100"),
  /** Link to this app used in emails n8n sends (e.g. your ngrok or company URL). */
  APP_PUBLIC_URL: z.string().url().default("http://localhost:3100"),
  /** Time zone used when the browser doesn't say (IANA name, e.g. Asia/Dhaka). */
  DEFAULT_TIME_ZONE: z.string().default("UTC"),
  /** Mark a document as failed if indexing hasn't finished after this many minutes. */
  INGEST_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),

  // --- OpenAI ---------------------------------------------------------------
  /** Used by AI_BACKEND=openai, and for voice transcription. */
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  /** Everyday answers. */
  OPENAI_MODEL: z.string().default("gpt-6.1-sol"),
  /** Deep dive and risk scan answers. */
  OPENAI_MODEL_DEEP: z.string().default("gpt-6-astra"),
  /** Reading scans/photos and writing document digests. */
  OPENAI_MODEL_FAST: z.string().default("gpt-6-luna"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-transcribe"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-large"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(3072),

  // --- Qdrant (search index; used by AI_BACKEND=openai) ----------------------
  /** From the host: http://localhost:6333. Inside Docker: http://qdrant:6333. */
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  QDRANT_COLLECTION: z.string().default("executive_docs"),
  QDRANT_API_KEY: z.string().optional().default(""),
});

/** Treat `KEY=` (empty) in .env the same as not setting the key, so defaults apply. */
function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function loadEnv() {
  const parsed = envSchema.safeParse(withoutEmptyValues(process.env));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nCheck your .env file.`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error("Set SESSION_SECRET in .env before running in production (openssl rand -hex 32).");
  }
  return env;
}

export type Env = ReturnType<typeof loadEnv>;

let cached: Env | undefined;

/** The validated settings. Read them as `env.DATABASE_URL`, etc. */
export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    cached ??= loadEnv();
    return cached[key as keyof Env];
  },
});
