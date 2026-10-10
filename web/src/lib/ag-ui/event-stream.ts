/**
 * Helper for sending AG-UI events to the browser as Server-Sent Events.
 *
 * AG-UI (https://docs.ag-ui.com) is an open protocol for agent ↔ UI
 * communication. A "run" is a stream of typed events, e.g.
 *   RUN_STARTED → STEP_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT… →
 *   TEXT_MESSAGE_END → CUSTOM → RUN_FINISHED
 * The official encoder formats each event as an SSE `data:` line, so we never
 * hand-write the wire format.
 */
import "server-only";
import { EventType, type BaseEvent } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

/** Function the run logic calls to send one event. */
export type EmitEvent = (event: BaseEvent) => void;

/**
 * Create a streaming Response for one AG-UI run.
 *
 * `run` receives an `emit` function and an AbortSignal (fires when the
 * browser disconnects). If `run` throws, a RUN_ERROR event is sent so the UI
 * can show what went wrong instead of hanging.
 */
export function agUiResponse(
  request: Request,
  run: (emit: EmitEvent, signal: AbortSignal) => Promise<void>,
): Response {
  // Always plain SSE (text/event-stream): every AG-UI client understands it.
  const encoder = new EventEncoder();
  const textEncoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: EmitEvent = (event) => {
        if (closed) return;
        const withTime = { ...event, timestamp: event.timestamp ?? Date.now() };
        try {
          controller.enqueue(textEncoder.encode(encoder.encodeSSE(withTime)));
        } catch {
          closed = true; // the browser disconnected mid-stream
        }
      };

      try {
        await run(emit, request.signal);
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[ag-ui] run failed:", error);
          emit({
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : "The assistant failed to answer.",
          } as BaseEvent);
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed because the browser went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stop reverse proxies (e.g. nginx) from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
