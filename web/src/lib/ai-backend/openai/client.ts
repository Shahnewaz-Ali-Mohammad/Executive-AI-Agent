/**
 * Minimal OpenAI API calls used by the direct backend (plain fetch, no SDK):
 *   - embed()        → /embeddings
 *   - respond()      → /responses (reading scans, writing digests)
 *   - streamChat()   → /chat/completions with stream: true (answers)
 */
import "server-only";
import { env } from "@/lib/env";

function apiUrl(path: string): string {
  return `${env.OPENAI_BASE_URL.replace(/\/$/, "")}${path}`;
}

function headers(): HeadersInit {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env, so OpenAI can't be called.");
  }
  return { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` };
}

/** POST to OpenAI; turns network and API errors into readable messages. */
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(`Can't reach OpenAI (${env.OPENAI_BASE_URL}). Check your internet connection.`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // Not JSON: keep the raw text.
    }
    throw new Error(`OpenAI error (HTTP ${response.status}): ${message}`);
  }
  return response;
}

/** Embedding vectors for each input text, in the same order. */
export async function embed(inputs: string[]): Promise<number[][]> {
  const response = await post("/embeddings", {
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
    input: inputs,
  });
  const json = (await response.json()) as { data: { index: number; embedding: number[] }[] };
  return [...json.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

/** Call the Responses API and return its text output. */
export async function respond(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const response = await post("/responses", body, signal);
  const json = (await response.json()) as {
    output_text?: string;
    output?: { content?: { type: string; text?: string }[] }[];
  };
  if (typeof json.output_text === "string") return json.output_text;
  return (json.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("\n");
}

/** Stream a chat answer from Chat Completions, yielding text pieces as they arrive. */
export async function* streamChat(options: {
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  system: string;
  user: string;
  signal: AbortSignal;
}): AsyncGenerator<string> {
  const response = await post(
    "/chat/completions",
    {
      model: options.model,
      reasoning_effort: options.reasoningEffort,
      stream: true,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    },
    options.signal,
  );
  if (!response.body) throw new Error("OpenAI sent an empty reply.");

  // Server-sent events: lines of "data: {json}", ending with "data: [DONE]".
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the unfinished line
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!line.trim().startsWith("data:") || !data || data === "[DONE]") continue;
      try {
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // Ignore keep-alive or partial lines.
      }
    }
  }
}
