/**
 * POST /api/transcribe — turn a voice recording into text with OpenAI
 * (model: OPENAI_TRANSCRIBE_MODEL, default gpt-transcribe).
 *
 * Only used as a fallback: most browsers (Chrome, Edge, Safari) transcribe
 * speech themselves via the Web Speech API, which is free and instant.
 * Firefox and some in-app browsers don't, so the mic button records audio and
 * sends it here instead.
 *
 * Body: multipart/form-data with an "audio" file. Response: { text }.
 */
import { env } from "@/lib/env";
import { handleRouteError, HttpError } from "@/lib/http";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's audio upload limit

export async function POST(request: Request) {
  try {
    if (!env.OPENAI_API_KEY) {
      throw new HttpError(501, "Voice transcription isn't configured (OPENAI_API_KEY is empty).");
    }

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) throw new HttpError(400, "No audio received.");
    if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "Recording is too long.");

    const upstream = new FormData();
    upstream.set("file", audio, audio.name || "recording.webm");
    upstream.set("model", env.OPENAI_TRANSCRIBE_MODEL);

    const response = await fetch(`${env.OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: upstream,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("[transcribe] OpenAI error:", response.status, await response.text());
      throw new HttpError(502, "Transcription failed. Please try again.");
    }

    const { text } = (await response.json()) as { text?: string };
    return Response.json({ text: text?.trim() ?? "" });
  } catch (error) {
    return handleRouteError(error);
  }
}
