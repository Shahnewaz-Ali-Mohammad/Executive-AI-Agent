/**
 * Health checks behind the System status page.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { getSchedulerStatus } from "@/lib/data/automation";
import { db } from "@/lib/db";
import { describeDatabaseError } from "@/lib/db/errors";
import { env } from "@/lib/env";
import type { SystemCheck, SystemStatusDTO } from "@/lib/types";

const TIMEOUT_MS = 3000;

async function check(run: () => Promise<Omit<SystemCheck, "id" | "label">>, id: string, label: string): Promise<SystemCheck> {
  try {
    return { id, label, ...(await run()) };
  } catch (error) {
    return { id, label, state: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function getSystemStatus(): Promise<SystemStatusDTO> {
  const usesN8n = env.AI_BACKEND === "n8n";
  const usesOpenAi = env.AI_BACKEND !== "mock";

  const checks = await Promise.all([
    check(
      async () => {
        try {
          await db.execute(sql`select 1`);
          return { state: "ok", detail: "Connected." };
        } catch (error) {
          return {
            state: "error",
            detail: describeDatabaseError(error) ?? "Can't reach the database.",
            fix: "Start Docker, then run: docker compose up -d",
          };
        }
      },
      "database",
      "Database",
    ),

    check(
      async () => {
        if (!usesOpenAi) return { state: "off", detail: "Not used in mock mode (AI_BACKEND=mock)." };
        if (!env.OPENAI_API_KEY && !usesN8n) {
          return { state: "error", detail: "OPENAI_API_KEY is empty.", fix: "Add your OpenAI key to .env and restart the app." };
        }
        return {
          state: "ok",
          detail: `${usesN8n ? "Answers run in n8n" : "Answers run in the app"} · ${env.OPENAI_MODEL} (deep: ${env.OPENAI_MODEL_DEEP}).`,
        };
      },
      "ai",
      "AI (OpenAI)",
    ),

    check(
      async () => {
        if (env.AI_BACKEND === "mock") return { state: "off", detail: "Not used in mock mode." };
        const response = await fetch(`${env.QDRANT_URL.replace(/\/$/, "")}/collections/${env.QDRANT_COLLECTION}`, {
          headers: env.QDRANT_API_KEY ? { "api-key": env.QDRANT_API_KEY } : {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        }).catch(() => null);
        if (!response) {
          return { state: "error", detail: `Can't reach ${env.QDRANT_URL}.`, fix: "Run: docker compose up -d qdrant" };
        }
        if (response.status === 404) {
          return {
            state: "error",
            detail: `The search collection "${env.QDRANT_COLLECTION}" doesn't exist.`,
            fix: "Run: docker compose up -d qdrant-init",
          };
        }
        if (!response.ok) return { state: "error", detail: `Qdrant answered HTTP ${response.status}.` };
        const body = (await response.json().catch(() => null)) as { result?: { points_count?: number } } | null;
        const points = body?.result?.points_count;
        return { state: "ok", detail: points !== undefined ? `${points.toLocaleString("en-GB")} passages indexed.` : "Reachable." };
      },
      "search",
      "Search index (Qdrant)",
    ),

    check(
      async () => {
        const response = await fetch(`${env.N8N_BASE_URL.replace(/\/$/, "")}/healthz`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        }).catch(() => null);
        if (!response || !response.ok) {
          return {
            state: "error",
            detail: `n8n isn't answering at ${env.N8N_BASE_URL}.`,
            fix: "Run: docker compose up -d n8n, then docker compose logs n8n --tail 30",
          };
        }
        return { state: "ok", detail: `Running · editor at ${env.N8N_BASE_URL}.` };
      },
      "n8n",
      "n8n",
    ),

    check(
      async () => {
        const scheduler = await getSchedulerStatus();
        if (scheduler.healthy) return { state: "ok", detail: "Checking for due work every minute." };
        return {
          state: "error",
          detail: scheduler.lastCheckAt
            ? `Last check-in ${new Date(scheduler.lastCheckAt).toLocaleString("en-GB")}.`
            : "It has never checked in.",
          fix:
            "In n8n (http://localhost:5678), workflow “4. Scheduler” must be active. If n8n can't reach the app, check APP_INTERNAL_URL and N8N_SHARED_SECRET in .env.",
        };
      },
      "scheduler",
      "Scheduler (tasks, reports, reminders)",
    ),

    check(
      async () => {
        const scheduler = await getSchedulerStatus();
        if (!scheduler.lastCheckAt) return { state: "off", detail: "Unknown until the scheduler checks in." };
        if (scheduler.emailEnabled) return { state: "ok", detail: "n8n sends emails through your SMTP account." };
        return {
          state: "off",
          detail: "Off. Results only appear in the app.",
          fix: "To turn on: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in .env, then run docker compose up -d n8n",
        };
      },
      "email",
      "Email",
    ),
  ]);

  return { checkedAt: new Date().toISOString(), checks: checks as SystemCheck[] };
}
