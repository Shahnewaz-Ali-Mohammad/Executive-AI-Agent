"use client";

/**
 * The saved conversations of the open workspace, and which one is on screen.
 *
 * The address decides which conversation is open (/w/:id/c/:conversationId,
 * or /w/:id for a new one) while the chat page is showing.
 *
 * Two ids matter:
 *   - `activeId`  the conversation new messages are saved to. `null` means a
 *                 fresh chat that isn't saved yet; it's created on the first
 *                 question (so "New conversation" never leaves empty entries).
 *   - `session`   changes only when a different conversation is opened or a
 *                 new one started. The chat reloads when it changes, but NOT
 *                 when a fresh chat gets its id mid-answer (the address then
 *                 catches up with the new conversation without reloading).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { lastVisited } from "@/lib/routes";
import type { ConversationDTO } from "@/lib/types";

export interface ChatSession {
  /** Changes whenever a different conversation is opened (reload trigger). */
  key: string;
  /** Saved conversation to load, or null for a fresh chat. */
  conversationId: string | null;
}

interface Options {
  /** The conversation in the address (null = a new one). */
  addressConversationId: string | null;
  /** Only follow the address while the chat page is showing. */
  followAddress: boolean;
  /** Called when a fresh chat has just been saved, so the address can follow. */
  onCreated: (conversationId: string) => void;
}

export function useConversations(workspaceId: string, { addressConversationId, followAddress, onCreated }: Options) {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  // The address last followed, and a counter that makes each fresh chat unique.
  const [followed, setFollowed] = useState<{ address: string | null; fresh: number } | null>(null);

  // Follow the address (adjusting state while rendering, as React recommends
  // for state derived from props, instead of an extra effect pass).
  if (followAddress && (followed === null || followed.address !== addressConversationId)) {
    const fresh = (followed?.fresh ?? 0) + 1;
    setFollowed({ address: addressConversationId, fresh });
    // Already on screen (e.g. the address just caught up with a new chat): keep it.
    if (session === null || addressConversationId !== activeId) {
      setActiveId(addressConversationId);
      setSession({ key: addressConversationId ?? `fresh-${fresh}`, conversationId: addressConversationId });
    }
  }

  // Latest values for callbacks.
  const activeRef = useRef(activeId);
  const onCreatedRef = useRef(onCreated);
  // The id being created for a fresh chat, so two quick questions don't create two.
  const creating = useRef<Promise<string> | null>(null);
  useEffect(() => {
    activeRef.current = activeId;
    if (!activeId) creating.current = null;
    lastVisited.setConversation(workspaceId, activeId);
  }, [activeId, workspaceId]);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    let cancelled = false;
    api
      .listConversations(workspaceId)
      .then((list) => !cancelled && setConversations(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load conversations."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  /** Clear the screen for a new conversation, even if a new one is already showing. */
  const startFresh = useCallback(() => {
    const fresh = (followed?.fresh ?? 0) + 1;
    setFollowed({ address: followed?.address ?? null, fresh });
    setSession({ key: `fresh-${fresh}`, conversationId: null });
    setActiveId(null);
  }, [followed]);

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
    if (activeRef.current) return activeRef.current;
    creating.current ??= api.createConversation(workspaceId).then((conversation) => {
      setConversations((list) => [conversation, ...list]);
      activeRef.current = conversation.id;
      setActiveId(conversation.id);
      onCreatedRef.current(conversation.id);
      return conversation.id;
    });
    try {
      return await creating.current;
    } catch (err) {
      creating.current = null;
      throw err;
    }
  }, [workspaceId]);

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await api.renameConversation(id, title);
    // Only the title changes (the count and last-message time stay as listed).
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteConversation(id);
    setConversations((list) => list.filter((c) => c.id !== id));
  }, []);

  return {
    conversations,
    loading,
    error,
    activeId,
    session,
    startFresh,
    ensureConversation,
    refresh,
    rename,
    remove,
  };
}
