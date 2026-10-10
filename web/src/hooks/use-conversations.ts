"use client";

/**
 * The saved conversations of the open workspace, and which one is on screen.
 *
 * Two ids matter:
 *   - `activeId`  the conversation new messages are saved to. `null` means a
 *                 fresh chat that isn't saved yet; it's created on the first
 *                 question (so "New conversation" never leaves empty entries).
 *   - `session`   changes only when the CEO opens a different conversation or
 *                 starts a new one. The chat reloads when it changes, but NOT
 *                 when a fresh chat gets its id mid-answer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { ConversationDTO } from "@/lib/types";

const lastConversationKey = (workspaceId: string) => `ea:last-conversation:${workspaceId}`;

function readLast(workspaceId: string): string | null {
  try {
    return window.localStorage.getItem(lastConversationKey(workspaceId));
  } catch {
    return null; // storage can be blocked (private mode); not important
  }
}

function writeLast(workspaceId: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(lastConversationKey(workspaceId), id);
    else window.localStorage.removeItem(lastConversationKey(workspaceId));
  } catch {
    // ignore
  }
}

export interface ChatSession {
  /** Changes whenever a different conversation is opened (reload trigger). */
  key: string;
  /** Saved conversation to load, or null for a fresh chat. */
  conversationId: string | null;
}

export function useConversations(workspaceId: string) {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const freshCounter = useRef(0);
  // The id being created for a fresh chat, so two quick questions don't create two.
  const creating = useRef<Promise<string> | null>(null);

  const openSession = useCallback(
    (conversationId: string | null) => {
      setActiveId(conversationId);
      writeLast(workspaceId, conversationId);
      creating.current = null;
      setSession({
        key: conversationId ?? `fresh-${++freshCounter.current}`,
        conversationId,
      });
    },
    [workspaceId],
  );

  // Load the list, then reopen the last conversation (or the newest one).
  useEffect(() => {
    let cancelled = false;
    api
      .listConversations(workspaceId)
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        const last = readLast(workspaceId);
        const start = list.find((c) => c.id === last) ?? list[0] ?? null;
        openSession(start?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load conversations.");
        openSession(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, openSession]);

  /** Reload the list (titles and order change as questions are asked). */
  const refresh = useCallback(async () => {
    const list = await api.listConversations(workspaceId).catch(() => null);
    if (list) setConversations(list);
  }, [workspaceId]);

  /**
   * The id to save the next question to. Creates the conversation on the first
   * question of a fresh chat, without reloading the chat on screen.
   */
  const ensureConversation = useCallback(async (): Promise<string> => {
    if (activeId) return activeId;
    creating.current ??= api.createConversation(workspaceId).then((conversation) => {
      setConversations((list) => [conversation, ...list]);
      setActiveId(conversation.id);
      writeLast(workspaceId, conversation.id);
      return conversation.id;
    });
    try {
      return await creating.current;
    } catch (err) {
      creating.current = null;
      throw err;
    }
  }, [activeId, workspaceId]);

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await api.renameConversation(id, title);
    setConversations((list) => list.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await api.deleteConversation(id);
      setConversations((list) => list.filter((c) => c.id !== id));
      if (id === activeId) openSession(null); // deleted the one on screen: start fresh
    },
    [activeId, openSession],
  );

  return {
    conversations,
    loading,
    error,
    activeId,
    session,
    open: (id: string) => openSession(id),
    startNew: () => openSession(null),
    ensureConversation,
    refresh,
    rename,
    remove,
  };
}
