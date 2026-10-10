"use client";

/**
 * Chat state for the open workspace, built on the official AG-UI client.
 *
 * `HttpAgent` POSTs a RunAgentInput to /api/chat, reads the SSE event stream,
 * and keeps `agent.messages` up to date as text arrives. We subscribe to it
 * and copy what the UI needs into React state:
 *   - messages        → the conversation
 *   - citations       → per assistant message, from the CUSTOM "citations" event
 *   - activity        → "Reading your documents…" while the backend searches
 *   - error           → from RUN_ERROR or a failed request
 *
 * One agent per open conversation. The chat panel is re-mounted (keyed by
 * session) whenever another conversation is opened or a new one started, so
 * each gets a fresh agent seeded with its saved history.
 */
import { HttpAgent, type AgentSubscriber, type Message } from "@ag-ui/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { Citation } from "@/lib/citations";
import type { ChatSession } from "@/hooks/use-conversations";
import type { ResponseModeId } from "@/lib/response-modes";
import {
  CITATIONS_EVENT,
  type ChatForwardedProps,
  type ChatMessageDTO,
  type CitationsEventValue,
} from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** When it was sent (ISO). Saved messages use the database time. */
  createdAt: string;
}

/** Human labels for the AG-UI STEP events the server emits. */
const STEP_LABELS: Record<string, string> = {
  reading_documents: "Reading your documents…",
};

/**
 * Keep only plain user/assistant text messages for display, with their time.
 * AG-UI messages carry no timestamp, so `times` remembers when each id was
 * first seen (or its saved time); new ids are stamped "now".
 */
function toChatMessages(messages: readonly Message[], times: Map<string, string>): ChatMessage[] {
  return messages.flatMap((message) => {
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return [];
    if (!times.has(message.id)) times.set(message.id, new Date().toISOString());
    return [{ id: message.id, role: message.role, content: message.content, createdAt: times.get(message.id)! }];
  });
}

/** Convert stored history into AG-UI messages to seed the agent. */
function fromHistory(history: ChatMessageDTO[]): Message[] {
  return history.map((message) => ({ id: message.id, role: message.role, content: message.content }) as Message);
}

interface UseExecutiveChatOptions {
  workspaceId: string;
  /** Which conversation is on screen. */
  session: ChatSession;
  /** Returns the conversation to save to, creating it on a fresh chat's first question. */
  ensureConversation: () => Promise<string>;
  /** Called after each answer (to refresh titles and order in the list). */
  onAnswered?: () => void;
}

export function useExecutiveChat({ workspaceId, session, ensureConversation, onAnswered }: UseExecutiveChatOptions) {
  const agentRef = useRef<HttpAgent | null>(null);
  const timesRef = useRef(new Map<string, string>());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Record<string, Citation[]>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(session.conversationId));

  const sessionKey = session.key;
  const loadId = session.conversationId;

  // Create the agent and seed it with the saved conversation (if any).
  useEffect(() => {
    let cancelled = false;
    const agent = new HttpAgent({ url: "/api/chat", threadId: loadId ?? crypto.randomUUID() });
    const times = timesRef.current;

    const subscriber: AgentSubscriber = {
      onMessagesChanged: ({ messages }) => setMessages(toChatMessages(messages, times)),
      onStepStartedEvent: ({ event }) => setActivity(STEP_LABELS[event.stepName] ?? "Working…"),
      onStepFinishedEvent: () => setActivity(null),
      onCustomEvent: ({ event }) => {
        if (event.name !== CITATIONS_EVENT) return;
        const value = event.value as CitationsEventValue;
        setCitations((current) => ({ ...current, [value.messageId]: value.citations }));
      },
      onRunErrorEvent: ({ event }) => setError(event.message),
      onRunFailed: ({ error }) => setError(error.message || "The assistant could not answer."),
    };
    const { unsubscribe } = agent.subscribe(subscriber);
    agentRef.current = agent;

    // A fresh chat has nothing to load.
    if (loadId) {
      api
        .listMessages(loadId)
        .then((history) => {
          if (cancelled) return;
          for (const message of history) times.set(message.id, message.createdAt);
          agent.setMessages(fromHistory(history));
          setMessages(toChatMessages(agent.messages, times));
          setCitations(Object.fromEntries(history.map((m) => [m.id, m.citations])));
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the chat."))
        .finally(() => !cancelled && setLoadingHistory(false));
    }

    return () => {
      cancelled = true;
      unsubscribe();
      agent.abortRun();
    };
  }, [sessionKey, loadId]);

  /** Ask a question in the chosen response mode. */
  const send = useCallback(
    async (text: string, mode: ResponseModeId) => {
      const agent = agentRef.current;
      const question = text.trim();
      if (!agent || !question || agent.isRunning) return;

      setError(null);
      setIsRunning(true);
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: question });
      setMessages(toChatMessages(agent.messages, timesRef.current));

      try {
        const conversationId = await ensureConversation();
        const forwardedProps: ChatForwardedProps = { workspaceId, conversationId, mode };
        await agent.runAgent({ forwardedProps });
        onAnswered?.();
      } catch (err) {
        // Aborting (Stop button) is not an error worth showing.
        if (!(err instanceof Error && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "The assistant could not answer.");
        }
      } finally {
        setIsRunning(false);
        setActivity(null);
      }
    },
    [workspaceId, ensureConversation, onAnswered],
  );

  /** Stop the answer that is currently streaming. */
  const stop = useCallback(() => {
    agentRef.current?.abortRun();
    setIsRunning(false);
    setActivity(null);
  }, []);

  return {
    messages,
    citations,
    isRunning,
    activity,
    error,
    loadingHistory,
    send,
    stop,
    dismissError: () => setError(null),
  };
}
