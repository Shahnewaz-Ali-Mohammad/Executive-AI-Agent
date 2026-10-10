"use client";

/**
 * Saved conversations of the open workspace, newest first.
 * Tap one to reopen it; "+" starts a new one (saved when the first question is asked).
 */
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import type { ConversationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ConversationDTO[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

/** "Today 14:05", "Yesterday", "Mon", or "7 Oct" — short enough for the sidebar. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (date.getTime() >= startOfToday) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (date.getTime() >= startOfToday - day) return "Yesterday";
  if (date.getTime() >= startOfToday - 6 * day) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(conversation: ConversationDTO) {
    const confirmed = window.confirm(`Delete the conversation "${conversation.title}"? Documents are kept.`);
    if (confirmed) await onDelete(conversation.id);
  }

  return (
    <nav aria-label="Conversations">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-xs font-medium text-slate">Conversations</h2>
        <IconButton aria-label="New conversation" onClick={onNew} className="size-7">
          <Plus className="size-4" />
        </IconButton>
      </div>

      {loading ? (
        <p className="px-4 py-2 text-xs text-slate">Loading…</p>
      ) : conversations.length === 0 ? (
        <p className="px-4 py-2 text-xs text-slate">No saved conversations yet. Ask a question to start one.</p>
      ) : (
        <ul className="max-h-[40vh] overflow-y-auto px-2">
          {conversations.map((conversation) =>
            editingId === conversation.id ? (
              <li key={conversation.id}>
                <TitleForm
                  initial={conversation.title}
                  onCancel={() => setEditingId(null)}
                  onSave={async (title) => {
                    await onRename(conversation.id, title);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={conversation.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={conversation.id === activeId ? "page" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md py-2 pr-16 pl-3 text-left text-sm transition-colors",
                    conversation.id === activeId
                      ? "bg-paper text-ink shadow-[inset_2px_0_0_var(--ledger)]"
                      : "text-slate hover:bg-paper hover:text-ink",
                  )}
                >
                  <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{conversation.title}</span>
                    <span className="block text-xs text-slate/80">{formatWhen(conversation.updatedAt)}</span>
                  </span>
                </button>
                {/* Always visible on touch screens (no hover there). */}
                <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  <IconButton
                    aria-label={`Rename ${conversation.title}`}
                    onClick={() => setEditingId(conversation.id)}
                    className="size-7"
                  >
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label={`Delete ${conversation.title}`}
                    onClick={() => handleDelete(conversation)}
                    className="size-7 hover:text-alert"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </nav>
  );
}

/** Inline text field for renaming a conversation. */
function TitleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return onCancel();
    try {
      await onSave(title.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={submit} className="py-1">
      <div className="flex items-center gap-1 rounded-md border border-ledger bg-surface pl-2">
        <input
          autoFocus
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onCancel()}
          aria-label="Conversation title"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none"
        />
        <IconButton type="submit" aria-label="Save title" className="size-7 text-ledger">
          <Check className="size-4" />
        </IconButton>
        <IconButton aria-label="Cancel" onClick={onCancel} className="size-7">
          <X className="size-4" />
        </IconButton>
      </div>
      {error && <p className="mt-1 px-1 text-xs text-alert">{error}</p>}
    </form>
  );
}
