/**
 * Minimal OpenAI API calls used by the direct backend (plain fetch, no SDK):
 *   - embed()        → /embeddings
 *   - respond()      → /responses (reading scans, writing digests)
 *   - streamChat()   → /chat/completions with stream: true (answers, form tools)
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

/** A function the model may call instead of (or as well as) writing text. */
export interface ChatTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments (strict mode: every property required, no extras). */
  parameters: Record<string, unknown>;
}

/** What the answer stream yields: text as it arrives, then any tool call once complete. */
export type ChatStreamPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; arguments: string };

interface ChatChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; function?: { name?: string; arguments?: string } }[];
    };
  }[];
}

/**
 * Stream a chat answer from Chat Completions. Text is yielded as it arrives;
 * tool calls arrive in pieces too, so they're collected and yielded at the end.
 */
export async function* streamChat(options: {
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  system: string;
  user: string;
  tools?: ChatTool[];
  signal: AbortSignal;
}): AsyncGenerator<ChatStreamPart> {
  const tools = options.tools ?? [];
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
      ...(tools.length > 0
        ? {
            tools: tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.parameters, strict: true },
            })),
          }
        : {}),
    },
    options.signal,
  );
  if (!response.body) throw new Error("OpenAI sent an empty reply.");

  const calls = new Map<number, { name: string; arguments: string }>();

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
      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(data) as ChatChunk;
      } catch {
        continue; // keep-alive or partial line
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) yield { type: "text", text: delta.content };
      for (const call of delta?.tool_calls ?? []) {
        const current = calls.get(call.index) ?? { name: "", arguments: "" };
        current.name += call.function?.name ?? "";
        current.arguments += call.function?.arguments ?? "";
        calls.set(call.index, current);
      }
    }
  }

  for (const call of calls.values()) {
    if (call.name) yield { type: "tool_call", name: call.name, arguments: call.arguments };
  }
}
